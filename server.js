
// Dependencies 
var express = require('express');
var mysql = require('mysql');
var bodyParser = require('body-parser');
var jwt = require('jsonwebtoken');
var expressJWT = require('express-jwt');
var http = require('http');
var https = require('https');
var port = process.env.PORT || 3000; 
var modules = require('./modules');
// Express
var app = express();

// MySQL 
var connection = mysql.createConnection({
        host     : 'localhost',
        user     : 'root',
        password : 'Twelve20',
        database : 'HotSpots'
    });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(expressJWT({ secret: '4949Now' }).unless({ path: ['/register']}));

// Routes 
app.post('/register', function(req, res) {

    if(req.body.UUID == null) {
        res.status(400).send('Invalid credentials');
    } else {
        // Store UUID, gender, and age in database
        connection.query("INSERT INTO users (gender, age, UUID) VALUES(\'" + req.body.gender + "\' , " + req.body.age + ", \'" + req.body.UUID + "\');" , function(err, rows, fields) {
           if(err) throw err; 
           var getUserIDQuery = "SELECT user_id FROM users WHERE UUID = \'" + req.body.UUID + "\';";
           // "select uuid from users where user_id = 1;"
           connection.query(getUserIDQuery, function(err, rows, fields) {
                if(err) throw err; 
                var userID = rows[0].user_id; 
                console.log("user ID = " + userID);
                var myToken = jwt.sign({ UUID: req.body.UUID, app: req.body.app }, '4949Now')
                res.status(200).json({ token: myToken, ID: userID });
           }); 
        });
    }
});


app.post('/updatelocation', function(req, res) {
    
    // Debugging purposes 
    //console.log("Latitude = " + req.body.latitude); 
    //console.log("Longitude = " + req.body.longitude);
    //console.log("User ID = " + req.body.userID);

    var proceedToUpdateUsersLocation = true
    //var stopFromUpdatingLocationMultipleTimesQuery = "SELECT * FROM checkins WHERE user_id = " + req.body.userID + " AND TIMESTAMPDIFF(SECOND, entered_at, current_timestamp) < 0.3 AND TIMESTAMPDIFF(SECOND, entered_at, current_timestamp) < 2;";   
        connection.query("SELECT * FROM checkins WHERE user_id = " + req.body.userID + " AND TIMESTAMPDIFF(MINUTE, entered_at, current_timestamp) < 2 ORDER BY user_id DESC LIMIT 1;", function(err, rows, fields) {
        if(err) throw err; 
        console.log("Number of rows in the table " + rows.length);
        if(rows.length > 0) {
            proceedToUpdateUsersLocation = false
        }

        console.log("Value of proceedToUpdateUsersLocation: " +  proceedToUpdateUsersLocation);
    if(proceedToUpdateUsersLocation) {

    var queryClosestLocation = "SELECT * FROM locations WHERE ST_Distance_Sphere(POINT(" + req.body.longitude + "," + req.body.latitude + "), coordinates) <= 20;";
    connection.query(queryClosestLocation, function(err, rows, fields) {
        if(err) throw err; 
        
        console.log("THIS LOCATION ALREADY EXISTS and the number of results is: " + rows.length);
        // A location already exists in the table 
        if(rows.length > 0) {

            // The location exists in the table
            // Fetch the location id 
            var locationID = rows[0].location_id; 
            // Add the user to that location through the checkins table 
            var addUserToLocationQuery = "INSERT INTO checkins (user_id, location_id) VALUES(" + req.body.userID + "," + locationID + ");"; 
            connection.query(addUserToLocationQuery, function(err, rows, fields) {  if(err) throw err;  });
            
        } else  {
            // Make request to google api 
            console.log("Going to make an api call to google");
            
            var options = {
                method: "GET",
                host: "maps.googleapis.com", 
                port: 443, 
                headers: {'Content-Type': 'application/json'}, 
                path: "/maps/api/place/nearbysearch/json?location=" + req.body.latitude + "," +  req.body.longitude + "&radius=20&key=AIzaSyAOTY7mKKWTk4uuDlUJIvhk9w14O5kF9XI"
            }; 
            
            var json = "";
            var jsonObj;
            var reqToGoogleAPI = https.request(options, (res) => {
               console.log("Status code: " + res.statusCode);

               res.on("data", (d) => {
                    json += d;
               });
               res.on("end", () => {
                    jsonObj = JSON.parse(json);
                    
                    // Add the location to the locations table 
                    for (var i = 0; i < jsonObj.results.length; i++) {
                        for (var j = 0; j < jsonObj.results[i].types.length; j++) {
                            console.log(jsonObj.results[i].name); 
                            console.log(j + ": " + jsonObj.results[i].types[j]);

                            var typeOfLocation = jsonObj.results[i].types[j]; 
                            if(typeOfLocation != "route" && typeOfLocation != "locality" && typeOfLocation != "political") {
                                
                                // Retrieve location info
                                var longitude = jsonObj.results[i].geometry.location.lng; 
                                var latitude = jsonObj.results[i].geometry.location.lat;
                                var name = jsonObj.results[i].name.replace(/'+/g, ""); 

                                console.log('the name of the business is ' + name);
                                
                                var addLocationQuery = "INSERT INTO locations (coordinates, name) VALUES(POINT(" + longitude + "," + latitude + "),\'" + name + "\');";
                                connection.query(addLocationQuery, function(err, rows, fields) { if(err) throw err; }); 
                                console.log("THE NEW LOCATION WAS ADDED SUCCESSFULLY");

                                var getLastRowID = "SELECT * FROM locations ORDER BY location_id DESC LIMIT 1";
                                connection.query(getLastRowID, function(err, rows, fields) { 
                                    if(err) throw err; 
                                    console.log("number of rows: " + rows.length);
                                    var lastLocationID = rows[0].location_id;
                                    console.log("last location ID is " + lastLocationID);
                                    var addUserToNewlyAddedLocationQuery = "INSERT INTO checkins (user_id, location_id) VALUES(" + req.body.userID + "," + lastLocationID + ");";
                                    connection.query(addUserToNewlyAddedLocationQuery, function(err, rows, fields) { if(err) throw err; });
                                });
                                return; 
                            }   
                        }
                    } 
                    
               });
            });
            reqToGoogleAPI.end();
        
            reqToGoogleAPI.on("error", (e) => {
                console.log(e);
            });
            
        }
    }); 
}
   

});
});
    

// Returns a list of hotspots around the users location
app.post('/gethotspots', function(req, res) {
    // Respond with a list of hotspots based on the users location, json format
    // Might need to send the desired amount of results 
    // use user search preference 
    // Might need to be a post/get request, sending user info and retrieving info 
    
    // NE TOP RIGHT
    // SW BOTTOM LEFT
    // X IS LONG
    // Y IS LAT
    //console.log("NElat: " + req.body.NECoordLat + ", NElong: " + req.body.NECoordLong); // TOP RIGHT 
    //console.log("SWlat: " + req.body.SWCoordLat + ", SWlong: " + req.body.SWCoordLong); // LEFT BOTTOM
    var jsonObj;
    var locationsWithinVisibleMapRectQuery = "SELECT * FROM locations WHERE Y(coordinates) > " + req.body.SWCoordLat + "AND Y(coordinates) < " + req.body.NECoordLat + "AND X(coordinates) > " + req.body.SWCoordLong + "AND X(coordinates) < " + req.body.NECoordLong + ";";

    //var secondQuery = "select distinct locations.name, checkins.user_id, age, gender, checkins.entered_at from checkins, users, locations WHERE checkins.location_id = locations.location_id and entered_at >= DATE_SUB(NOW(), INTERVAL 60 MINUTE) AND checkins.user_id = users.user_id AND Y(coordinates) > " + req.body.SWCoordLat + "AND Y(coordinates) < " + req.body.NECoordLat + "AND X(coordinates) > " + req.body.SWCoordLong + "AND X(coordinates) < " + req.body.NECoordLong + ";";

    connection.query(locationsWithinVisibleMapRectQuery, function(err, rows, fields) {
        if(err) throw err; 
        /*
        console.log(rows.length);
        for(var i = 0; i < rows.length; i++) {
            console.log(rows[i].name);
        }
        */ 
        jsonObj = modules.createJSONObject(rows);
        //res.send(jsonObj);
    });
    
    // Return average age of each location
    // Return number of people, number of girls/guys 
    // Store info in an array of objects about each loc 
    // Info about a location within the last 10 minutes 


});


// Returns information about a particular location the user searched for 
app.get('/search', function(req, res) {
    // Returning a specific location and the information about it
    // Might need to send information about the particular business requested 
    res.status(200).json({"name": "Mihad"});


});

// Start server 
app.listen(port);
console.log("HotSpots app listening on port: " + port);


/*
var connection = mysql.createConnection({
        host     : 'localhost',
        user     : 'root',
        password : 'Twelve20',
        port     : '3306', 
        database : 'hotspots'
    });




*/

