
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
   
    // Debugging purposes 
    console.log("Latitude = " + req.body.latitude); 
    console.log("Longitude = " + req.body.longitude);
    
    var queryClosestLocation = "SELECT * FROM locations WHERE ST_Distance_Sphere(POINT(" + req.body.longitude + "," + req.body.latitude + "), coordinates) <= 8;";
    
    connection.query(queryClosestLocation , function(err, rows, fields) {
        console.log("Error: " + err);
        console.log("Rows from table: " + rows.length);

        if(err == null && rows.length > 0) {
            // The location exists in the table
            // Add the user to that location
            if(rows.length > 1) {
                connection.query("SELECT * FROM users;", function(err, rows, fields) {
                    console.log('hello');
                    console.log(rows[0].UUID);
                });
            }

    
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
                path: "/maps/api/place/nearbysearch/json?location=" + req.body.latitude + "," +  req.body.longitude + "&radius=100&types=airport|amusement_park|aquarium|art_gallery|bakery|bank|bar|beauty_salon|bicycle_store|book_store|bowling_alley|bus_station|cafe|campground|car_dealer|car_repair|casino|church|city_hall|clothing_store|convenience_store|courthouse|department_store|electrician|electronics_store|finance|florist|food|furniture_store|general_contractor|grocer_or_supermarket|gym|hair_care|hardware_store|hospital|jewelry_store|laundry|library|liquor_store|lodging|movie_theater|museum|night_club|painter|park|parking|pet_store|pharmacy|post_office|real_estate_agency|restaurant|rv_park|school|shoe_store|shopping_mall|spa|stadium|storage|store|subway_station|train_station|travel_agency|university|zoo&key=AIzaSyAOTY7mKKWTk4uuDlUJIvhk9w14O5kF9XI"
            }
            
            var reqToGoogleAPI = https.request(options, (res) => {
               console.log("Status code: " + res.statusCode);

               res.on("data", (d) => {
                    //process.stdout.write(d);
                    json += d;
               });
               res.on("end", () => {
                    var obj = JSON.parse(json);
                    console.log( obj.results[0].name);
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

