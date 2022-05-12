// times in milliseconds
let DAY = 1000 * 60 * 60 * 24
let WEEK = DAY * 7
let MONTH = DAY * 30

// all the objects using from google maps api
let gMaps = { infoWindow: null, map: null, region: null, clusterer: null }

class Filters {
  static timeRange = 'ALL_TIME'
  static region = {
    center: coord(50, 0),
    radius: 1500 * 1000,  // 1500 kilometers
    enabled: false
  }

  // purpose: toggle whether or not region filtering is enabled and re-render
  // assumptions: none
  // inputs: none
  // post-conditions: sets enabled to the opposite of what it was
  static async toggleRegion() {
    Filters.region.enabled = !Filters.region.enabled
    await renderAll()
  }

  // purpose: change the region (circle) that is being filtered over
  // assumptions: none (expected to be enabled, but doesn't matter if not)
  // inputs: center, radius
  // post-conditions: center and radius to be updated
  static updateRegion(center, radius) {
    Filters.region.center = center
    Filters.region.radius = radius
  }

  // purpose: change the time that is being filtered over and re-render
  // assumptions: newValue is one of the options used in 'byTime'
  // inputs: newValue
  // post-conditions: time has been updated
  static async updateTime(event) {
    Filters.timeRange = event.target.value
    await renderAll()
  }

  // purpose: checks if the sighting should be displayed or not
  // assumptions: none
  // inputs: sighting
  // post-conditions: returns a boolean that is true if the sighting should be displayed
  static isSatisfiedBy(sighting) {
    return Filters.byTime(sighting) && Filters.byRegion(sighting)
  }

  // purpose: checks if the sighting is within the desired time range
  // assumptions: sighting timestamp is in the past
  // inputs: sighting
  // post-conditions: returns a boolean that is true if the sighting is within the time range
  static byTime(sighting) {
    let timeSince = Date.now() - sighting.timestamp
    let range = Filters.timeRange

    return (
      (range === "ALL_TIME")
      || (range === "LAST_YEAR" && timeSince <= 365 * DAY)
      || (range === "LAST_MONTH" && timeSince <= 30 * DAY)
      || (range === "LAST_WEEK" && timeSince <= 7 * DAY)
      || (range == "LAST_DAY" && timeSince <= DAY)
    )
  }

  // purpose: checks if the sighting is within the desired region (circle)
  // assumptions: sighting position is a valid coordinate
  // inputs: sighting
  // post-conditions: returns a boolean that is true if the sighting is within the region
  static byRegion(sighting) {
    if (!Filters.region.enabled) {
      return true
    }

    // is the sighting inside the circle?
    return google.maps.geometry.spherical.computeDistanceBetween(sighting.position, Filters.region.center) <= Filters.region.radius
  }
}

class Database {
  static SPREADSHEET_ID = '1SClvP7EY7GViI0W6LrutMOyS3Fp--g3v6lFdInXZ5XU'
  static SHEET_NAME = 'Sheet1'
  static API_KEY = 'AIzaSyAvoqq9iKVMJJCffu7O5E1qLYJmG9r4fMU'
  static SHEET_URL = `https://sheets.googleapis.com/v4/spreadsheets/${Database.SPREADSHEET_ID}/values/${Database.SHEET_NAME}!A1:R?key=${Database.API_KEY}`

  static isLoaded = false
  static data = null

  // purpose: fetch data from the Google Sheets API
  // assumptions: the sheet URL is correct/valid
  // inputs: none
  // post-conditions: returns a 2D array of strings (each cell in each row)
  static async fetchFromApi() {
    let response = await fetch(Database.SHEET_URL)
    // reads the response as a json string and converts it to a string[][]
    return await response.json()
  }

  // purpose: download data from google sheet and convert specific format
  // assumptions: the sheet URL is correct and the sheet has the correct columns
  // inputs: none
  // post-conditions: returns data in new format with some values converted from string representation
  static async loadData() {
    let data = await Database.fetchFromApi()
    console.log('API response', data)

    let header = data.values[0]
    let rows = data.values.slice(1)

    let sightings = []
    for (let row of rows) {
      sightings.push(Database.convertRow(row))
    }

    console.log('converted', sightings)

    Database.data = { header, sightings }
    Database.isLoaded = true
  }

  // purpose: convert a single row from the sheet to a specific format
  // assumptions: the row has the correct number of cells and they each have the correct format
  // inputs: row
  // post-conditions: returns a single row formatted in a way the rest of the site can use
  static convertRow(row) {
    // get each of the cells in the row and assigning to letiables (all strings)
    let [
      id, timestamp, latitude, longitude, observerEmail, observationType, timeSpentAfieldInMinutes,
      distanceTraveledInMiles, numberOfObservers, numberOfCatsObserved, walking, running, resting, chasingSomething,
      birdInMouth, smallMammalInMouth, clippedEar, notes
    ] = row

    // convert the strings into something easier to work with
    let position = coord(parseFloat(latitude), parseFloat(longitude))
    let datetime = new Date(Date.parse(timestamp))
    let isWalking = Database.parseTrueFalse(walking)
    let isRunning = Database.parseTrueFalse(running)
    let isResting = Database.parseTrueFalse(resting)
    let isChasingSomething = Database.parseTrueFalse(chasingSomething)
    let hasBirdInMouth = Database.parseTrueFalse(birdInMouth)
    let hasSmallMammalInMouth = Database.parseTrueFalse(smallMammalInMouth)
    let hasClippedEar = Database.parseTrueFalse(clippedEar)

    return {
      id,
      originalRow: row, // used for csv download
      timestamp: datetime,
      position,
      marker: new google.maps.Marker({
        position,
        title: `Sighting #${id}`,
        icon: getMarkerColor(datetime),
      }),
      infoWindowContent: `
          <b>Sighting #${id}</b><br/>
          Observed at: <b>${datetime.toLocaleString("en-US")}</b><br/>
          Observation type: <b>${observationType}</b><br/>
          Number of cats: <b>${numberOfCatsObserved}</b><br/>
          <br/>
          Walking? ${showTrueFalse(isWalking)}<br/>
          Running? ${showTrueFalse(isRunning)}<br/>
          Resting? ${showTrueFalse(isResting)}<br/>
          Chasing something? ${showTrueFalse(isChasingSomething)}<br/>
          Bird in mouth? ${showTrueFalse(hasBirdInMouth)}<br/>
          Small mammal in mouth? ${showTrueFalse(hasSmallMammalInMouth)}<br/>
          Clipped ear? ${showTrueFalse(hasClippedEar)}<br/>
          <br/>
          <i>${notes || "No notes"}</i>
      `,
      cells: [ // to display in the table
        id,
        datetime.toLocaleString("en-US"),
        observationType,
        numberOfCatsObserved,
        showTrueFalse(isWalking),
        showTrueFalse(isRunning),
        showTrueFalse(isResting),
        showTrueFalse(isChasingSomething),
        showTrueFalse(hasBirdInMouth),
        showTrueFalse(hasSmallMammalInMouth),
        showTrueFalse(hasClippedEar),
        notes || ""
      ]
    }
  }

  // purpose: convert 'TRUE' and 'FALSE' strings to booleans
  // assumptions: the input is 'TRUE' or 'FALSE'
  // inputs: cell
  // post-conditions: returns a boolean or prints an error to the console
  static parseTrueFalse(cell) {
    let s = cell.trim().toUpperCase()
    if (s === "TRUE") {
      return true
    } else if (s === "FALSE") {
      return false
    } else {
      console.error(`'${cell}' can't be converted to a boolean`)
      return null
    }
  }

  // purpose: get the converted sightings data (fetch it if needed first)
  // assumptions: none
  // inputs: none
  // post-conditions: returns all the sightings data (and saves it for future use)
  static async getSightings() {
    if (!Database.isLoaded) {
      await Database.loadData()
    }

    return Database.data.sightings
  }

  // purpose: get the converted sightings data (fetch it if needed first) filtered down
  // assumptions: none
  // inputs: none
  // post-conditions: returns filtered sightings data
  static async getFilteredSightings() {
    let sightings = await Database.getSightings()
    let filteredSightings = []
    for (let sighting of sightings) {
      if (Filters.isSatisfiedBy(sighting)) {
        filteredSightings.push(sighting)
      }
    }

    return filteredSightings
  }

  // purpose: get the content of the CSV download file of the filtered sightings
  // assumptions: none
  // inputs: none
  // post-conditions: returns filtered sightings data as csv
  static async getCSVContent() {
    let filteredSightings = await Database.getFilteredSightings()
    let header = Database.data.header

    let fileContent = header.join(',') + '\n'

    for (let sighting of filteredSightings) {
      let row = []
      for (let cell of sighting.originalRow) {

        // if it contains a comma it should be in quotes
        if (cell.includes(',')) {
          row.push(`"${cell}"`)
        } else {
          row.push(cell)
        }
      }

      // if it contains newlines, we convert the newlines to semicolon
      fileContent += row.join(',').replace(/[\n\r]/g, ';')
      fileContent += '\n'
    }

    return fileContent
  }
}

// purpose: display the filtered sightings data in a table and display how many results are visible
// assumptions: there is a table with id 'results_table' in the html and a text item with id 'display_counter'
// inputs: none
// post-conditions: the table will be populated with the filtered data and the counter will display the number of results
async function renderTable() {
  let filteredSightings = await Database.getFilteredSightings()

  document.getElementById('results_table').innerHTML = getTableContent(filteredSightings)
  document.getElementById("display_counter").innerText = filteredSightings.length
}

// purpose: computes the content of the results table
// assumptions: the sightings should have a cells string array with the correct number of items
// inputs: sightings
// post-conditions: returns a string containing the html to display the results in the table
function getTableContent(sightings) {
  let tableContent = `
  <tr>
    <th>Id</th>
    <th>Timestamp</th>
    <th>Type</th>
    <th># of cats</th>
    <th>Walking?</th>
    <th>Running?</th>
    <th>Resting?</th>
    <th>Chasing?</th>
    <th>Bird in mouth?</th>
    <th>Small mammal in mouth?</th>
    <th>Clipped ear?</th>
    <th>Notes</th>
  </tr>
  `

  for (let sighting of sightings) {
    // build up the html for a row
    let rowContent = "<tr>"
    for (let cell of sighting.cells) {
      rowContent += `<td>${cell}</td>`
    }
    rowContent += "</tr>"
    tableContent += rowContent
  }

  return tableContent
}

// purpose: re-renders the map and table
// assumptions: none
// inputs: none
// post-conditions: the UI has been updated
async function renderAll() {
  await renderTable()
  await renderMap()
}

// purpose: re-renders the map
// assumptions: google maps has already been loaded
// inputs: none
// post-conditions: the map has been redrawn
async function renderMap() {
  let infoWindow = gMaps.infoWindow
  let map = gMaps.map
  let region = gMaps.region
  let clusterer = gMaps.clusterer

  // close the info window before doing anything (it lingers or breaks otherwise)
  infoWindow.close()

  // need all of them but also need to know which ones are visible currently
  // (doesn't actually make a request, should already have cached the data)
  let sightings = await Database.getSightings()
  let filteredSightings = await Database.getFilteredSightings()

  // remove all markers from the map
  for (let sighting of sightings) {
    sighting.marker.setMap(null)
  }

  // also remove the clusters from the map
  clusterer.setMap(null)

  // put only the visible markers back on the map
  let markersToCluster = []
  for (let sighting of filteredSightings) {
    sighting.marker.setMap(map)
    markersToCluster.push(sighting.marker)
  }

  // overwrite the clusterer (simpler than reusing the old one)
  gMaps.clusterer = new markerClusterer.MarkerClusterer({
    map,
    markers: markersToCluster,
    onClusterClick: (e, cluster) => {
      infoWindow.close() // if this doesn't happen it zooms into any open window??
      map.fitBounds(cluster.bounds)
    }
  })

  // draw the region filter circle if enabled, otherwise hide it
  if (Filters.region.enabled) {
    region.setMap(map)
  } else {
    region.setMap(null)
  }
}

// purpose: google map calls this when it is first loaded and it draws the map initially
// assumptions: none
// inputs: none
// post-conditions: the map is drawn and the global google maps objects are set (in gMaps)
async function initMap() {
  // create info window, map, and region filter circle
  // (the info window and circle aren't drawn on the map yet)

  //await new Promise(r => setTimeout(() => r(), 5000))

  let infoWindow = new google.maps.InfoWindow()

  let map = new google.maps.Map(
    document.getElementById("map_canvas"),
    {
      zoom: 2,
      center: coord(0, 0)
    }
  )

  let region = new google.maps.Circle({
    strokeColor: "#FF0000", // red
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: "#FF0000",
    fillOpacity: 0.35,
    editable: true, // so the user can drag and expand
    geodesic: true, // makes it match the map distortion
    center: Filters.region.center,
    radius: Filters.region.radius,
  })

  // react to changes the user makes to the region filter

  region.addListener('radius_changed', async () => {
    let center = region.getCenter()
    Filters.updateRegion({
      lat: center.lat(),
      lng: center.lng()
    }, region.getRadius())
    await renderAll()
  })
  region.addListener('center_changed', async () => {
    let center = region.getCenter()
    Filters.updateRegion({
      lat: center.lat(),
      lng: center.lng() 
    }, region.getRadius())
    await renderAll()
  })

  let sightings = await Database.getSightings()
  let markersToCluster = []
  //sightings.forEach(sighting => addInfoWindowForSighting(sighting, infoWindow))

  for (let sighting of sightings) {
    // when you click on a marker, display the info window above it with some of the data
    sighting.marker.addListener('click', () => {
      infoWindow.close()
      infoWindow.setContent(`<div>${sighting.infoWindowContent}</div>`)
      infoWindow.open({
        map,
        anchor: sighting.marker
      })
    })

    markersToCluster.push(sighting.marker)
  }

  // create the clusterer but don't draw it on the map yet

  let clusterer = new markerClusterer.MarkerClusterer({
    markers: markersToCluster,
    onClusterClick: (e, cluster) => {
      infoWindow.close()
      map.fitBounds(cluster.bounds)
    }
  })

  // set the global object for future use
  gMaps = { infoWindow, map, region, clusterer }

  await renderMap()
}

// purpose: creates a coordinate object that google maps can use
// assumptions: latitude and longitude are valid coordinates
// inputs: latitude, longitude 
// post-conditions: returns coordinate object
function coord(latitude, longitude) {
  return { lat: latitude, lng: longitude }
}

// purpose: prints a cross or tick depending on true or false
// assumptions: none
// inputs: b 
// post-conditions: returns an html entity for cross or tick (or "???" if something went wrong)
function showTrueFalse(b) {
  if (b === null) return "???"
  else if (b) return "&#x2713;" // tick mark
  else return "&#x2717;" // cross
}

// purpose: returns a different icon depending on how long ago a sighting was
// assumptions: the timestamp is in the past
// inputs: timestamp
// post-conditions: returns an object with a url to the correct icon (can be used by google maps)
function getMarkerColor(timestamp) {
  // the number of milliseconds since the sighting
  let difference = Date.now() - timestamp

  if (difference > MONTH) {
    // longer than a month is red
    return { url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png" }
  } else if (difference > 2 * WEEK) {
    // 2 weeks to a month is orange
    return { url: "http://maps.google.com/mapfiles/ms/icons/orange-dot.png" }
  } else if (difference > WEEK) {
    // 1 week to 2 weeks is yellow
    return { url: "http://maps.google.com/mapfiles/ms/icons/yellow-dot.png" }
  } else {
    // shorter than a week is green
    return { url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png" }
  }
}

// purpose: Download the filtered data as a CSV with the same format as the google sheet
// assumptions: none
// inputs: none
// post-conditions: triggers a download from the browser, no other effects
async function download() {
  let fileContent = await Database.getCSVContent()

  // trigger a download

  let link = document.createElement('a')
  link.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(fileContent))
  link.setAttribute('download', 'data.csv')
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// when the script first loads, we can only render the table. then a few milliseconds later,
// google maps will finish loading and will draw the map
renderTable()