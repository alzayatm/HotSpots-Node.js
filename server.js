
// Dependencies 
var express = require('express');
var mysql = require('mysql');
var bodyParser = require('body-parser');
var jwt = require('jsonwebtoken');
var expressJWT = require('express-jwt');
var http = require('http');
var https = require('https');
var port = process.env.PORT || 3000; 

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
                /*
                console.log("length " + rows.length);
                USERID = rows[0].user_id; 
                console.log("The user ID is (1)" + USERID);
                */ 

                var userID = rows[0].user_id; 
                console.log("user ID = " + userID);
                var myToken = jwt.sign({ UUID: req.body.UUID, app: req.body.app }, '4949Now')
                res.status(200).json({ token: myToken, ID: userID });
           }); 
        });
    
        /*
        // Create token for authentication 
        console.log("the user ID is (2)" + USERID);
        var myToken = jwt.sign({ UUID: req.body.UUID, app: req.body.app }, '4949Now')
        res.status(200).json({ token: myToken, ID: USERID });
        */ 
    }
});

var count = 0; 
// User updates location in form of lat and long 
app.post('/updatelocation', function(req, res) {
    count++; 
    
    // must not use timeout, rather, query the checkins and make sure it's not the same request inserted 
    function queryForLocationAndAddUser() {
    
    // Debugging purposes 
    console.log("Latitude = " + req.body.latitude); 
    console.log("Longitude = " + req.body.longitude);
    console.log("User ID = " + req.body.userID);
    
    var queryClosestLocation = "SELECT * FROM locations WHERE ST_Distance_Sphere(POINT(" + req.body.longitude + "," + req.body.latitude + "), coordinates) <= 10;";
    connection.query(queryClosestLocation, function(err, rows, fields) {
        if(err) throw err; 
        
        // A location already exists in the table 
        if(rows.length > 0) {

            console.log("THIS LOCATION ALREADY EXISTS and the number of results is: " + rows.length);
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
                path: "/maps/api/place/nearbysearch/json?location=" + req.body.latitude + "," +  req.body.longitude + "&radius=10&key=AIzaSyAOTY7mKKWTk4uuDlUJIvhk9w14O5kF9XI"
            }; 
            
            var json = "";
            var jsonObj;
            var reqToGoogleAPI = https.request(options, (res) => {
               console.log("Status code: " + res.statusCode);

               res.on("data", (d) => {
                    //process.stdout.write(d);
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
    if(count ==  1) 
        queryForLocationAndAddUser();
      else 
        setTimeout(function() { count = 0; }, 500);
     
     
});

// Returns a list of hotspots around the users location
app.get('/gethotspots', function(req, res) {
    // Send a list of hotspots based on the users location, json format
    // Might need to send the desired amount of results 
    // Might need to be a post/get request, sending user info and retrieving info 
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

