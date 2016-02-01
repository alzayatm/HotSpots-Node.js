
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

// User updates location in form of lat and long 
app.post('/updatelocation', function(req, res) {
   
    // Debugging purposes 
    console.log("Latitude = " + req.body.latitude); 
    console.log("Longitude = " + req.body.longitude);
    console.log("User ID = " + req.body.userID);
    
    var queryClosestLocation = "SELECT * FROM locations WHERE ST_Distance_Sphere(POINT(" + req.body.longitude + "," + req.body.latitude + "), coordinates) <= 8;";
    
    connection.query(queryClosestLocation, function(err, rows, fields) {
        if(err) throw err; 
        
        // A location already exists in the table 
        if(rows.length > 0) {

            // The location exists in the table
            // Fetch the location id 
            var locationID = rows[0].location_id; 
            // Add the user to that location through the checkins table 
            var addUserLocationQuery = "INSERT INTO checkins (user_id, location_id) VALUES(" + req.body.userID + "," + locationID + ");"; 
            connection.query(addUserLocationQuery, function(err, rows, fields) {
                if(err) throw err; 
            });
            
        } else  {
            // Make request to google api to add location to table 
            // Add the individual to that location after the location is pulled from the google api 
            console.log("Going to make an api call to google");
            //var data = "";
            var json = "";
            var options = {
                method: "GET",
                host: "maps.googleapis.com", 
                port: 443, 
                headers: {'Content-Type': 'application/json'}, 
                path: "/maps/api/place/nearbysearch/json?location=" + req.body.latitude + "," +  req.body.longitude + "&radius=10&key=AIzaSyAOTY7mKKWTk4uuDlUJIvhk9w14O5kF9XI"
            }; 
            
            var reqToGoogleAPI = https.request(options, (res) => {
               console.log("Status code: " + res.statusCode);

               res.on("data", (d) => {
                    //process.stdout.write(d);
                    json += d;
               });
               res.on("end", () => {
                    var obj = JSON.parse(json);
                    for (var i = 0; i < obj.results.length; i++) {
                        for (var j = 0; j < obj.results[i].types.length; j++) {
                            console.log(obj.results[i].types[j]);
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

