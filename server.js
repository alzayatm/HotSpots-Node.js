
// Dependencies 
var express = require('express');
var mysql = require('mysql');
var bodyParser = require('body-parser');
var jwt = require('jsonwebtoken');
var expressJWT = require('express-jwt');
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
           
            if(err != null) {
                console.log(err);
            }
        });
    
        // Create token for authentication 
        var myToken = jwt.sign({ UUID: req.body.UUID, app: req.body.app }, '4949Now')
        res.status(200).json({ token: myToken });
    }
});

// User updates location in form of lat and long 
app.post('/updatelocation', function(req, res) {
   
    var coordinate = {
        latitude: req.body.latitude, 
        longitude: req.body.longitude
    }

    console.log("Latitude = " + coordinate.latitude); 
    console.log("Longitude = " + coordinate.longitude);
    var locationExistsInTable = false 
    res.send('Received lat and long');
    /*
    connection.query("", function(err, rows, fields) {

        if(err == null && rows.length > 0) {
            locations = true 
        }
    }); 

    if(locationExistsInTable) {
        // Query the db, updating that there's a person at that particular location 
    } else {
        // Make request to google api to add location to table 
        // Add the individual to that location after the location is pulled from the google api 
    }

    
    */ 
});

// Returns a list of hotspots around the users location
app.get('/gethotspots', function(req, res) {
    // Send a list of hotspots based on the users location
    // Might need to send the desired amount of results 
    // Might need to be a post request, sending user info and retrieving info 
});


// Returns information about a particular location the user searched for 
app.get('/search', function(req, res) {
    // Returning a specific location and the information about it
    // Might need to send information about the particular business requested 
    res.status(200).json({"name": "Mihad"});


});

// Start server 
app.listen(port);
console.log("Rest demo listening on port: " + port);


/*
var connection = mysql.createConnection({
        host     : 'localhost',
        user     : 'root',
        password : 'Twelve20',
        port     : '3306', 
        database : 'hotspots'
    });




*/

