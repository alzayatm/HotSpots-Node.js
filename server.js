
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

app.post('/updateLocation', function(req, res) {
    
    var proceedToUpdateUsersLocation = true

    var checkIfDuplicateQuery = "SELECT * FROM checkins WHERE user_id = " + req.body.userID + " AND TIMESTAMPDIFF(SECOND, entered_at, current_timestamp) < 5;";
    connection.query(checkIfDuplicateQuery, function(err, rows, fields) {
        if (err) throw err; 
        /*
        console.log("Update rows: "+ rows.length);
        for(var i = 0; i < rows.length; i++) {
            console.log(rows[i].checkin_id);
        }
        */ 
        if (rows.length > 0) proceedToUpdateUsersLocation = false; // A duplicate record exists, do not update table

        if (proceedToUpdateUsersLocation) {

            // Check if closest location exists in locations table 
            var queryClosestLocation = "SELECT * FROM locations WHERE ST_Distance_Sphere(POINT(" + req.body.longitude + "," + req.body.latitude + "), coordinates) <= 20;";
            connection.query(queryClosestLocation, function(err, rows, fields) {
                if (err) throw err; 
                // If rows.length > 0, the location closest to the user exists in the table 
                if (rows.length > 0) {
                    // Retrieve the location ID 
                    var locationID = rows[0].location_id; 
                    // Make a query to add the user to that location 
                    var addUserToLocationQuery = "INSERT INTO checkins (user_id, location_id) VALUES(" + req.body.userID + "," + locationID + ");"; 
                    connection.query(addUserToLocationQuery, function(err, rows, fields) { if (err) throw err; })
                } else {
                    // The location does not exist in the table, we make a call to google api for that location 
                    var options = {
                        method: "GET",
                        host: "maps.googleapis.com", 
                        port: 443, 
                        headers: {'Content-Type': 'application/json'}, 
                        path: "/maps/api/place/nearbysearch/json?location=" + req.body.latitude + "," +  req.body.longitude + "&radius=20&key=AIzaSyAOTY7mKKWTk4uuDlUJIvhk9w14O5kF9XI"
                    };

                    var data = ""; 
                    var json; 
                    var reqToGoogleApi = https.request(options, (res) => {

                        res.on("data", (d) => {
                            data += d; 
                        }); 

                        res.on("end", () => {
                            json = JSON.parse(data); 

                            // Add the location retrieved from google's api to the locations table 
                            for (var i = 0; i < json.results.length; i++) {
                                for (var j = 0; j < json.results[i].types.length; j++) {

                                    var typeOfLocation = json.results[i].types[j];
                                    if (typeOfLocation != "route" && typeOfLocation != "locality" && typeOfLocation != "political") {

                                        var longitude = json.results[i].geometry.location.lng; 
                                        var latitude = json.results[i].geometry.location.lat; 
                                        var name = json.results[i].name.replace(/'+/g, ""); 

                                        // Add the location query 
                                        var addLocationQuery = "INSERT INTO locations (coordinates, name) VALUES(POINT(" + longitude + "," + latitude + "),\'" + name + "\');";
                                        connection.query(addLocationQuery, function(err, rows, fields) { if (err) throw err; });

                                        // Retrieve the ID of the location and add the user 
                                        var getLastRowID = "SELECT * FROM locations ORDER BY location_id DESC LIMIT 1";
                                        connection.query(getLastRowID, function(err, rows, fields) {
                                            if (err) throw err; 
                                            var lastLocationID = rows[0].location_id;
                                            var addUserToLocation = "INSERT INTO checkins (user_id, location_id) VALUES(" + req.body.userID + "," + lastLocationID + ");";
                                            connection.query(addUserToLocation, function(err, rows, fields) { if (err) throw err; }); 
                                        });
                                        return; 
                                    }
                                }
                            }
                        }); 
                    }); 
                    reqToGoogleApi.end(); 
                    req.on("error", (e) => {
                        console.log(e);
                    }); 
                }
            });
        }
    });
}); 

// Returns a list of hotspots around the users location
app.post('/gethotspots', function(req, res) {

    function calculateCheckinsPerLocation(ageArray, genderArray ,averageAge ,businessName ,data, iteration ,callback) {
        var getAgeAndGenderQuery = "SELECT gender, age FROM users WHERE user_id = " + data[iteration].user_id + ";";
        connection.query(getAgeAndGenderQuery, function(err, rows) {

            var numOfFemales = 0; 
            var numOfMales = 0;
            var numOfPeople = data.length
                
            for (var z = 0; z < rows.length; z++) {
                genderArray.push(rows[z].gender); 
                ageArray.push(rows[z].age); 
            }

            var sum = 0; 
            for (var a = 0; a < ageArray.length; a++) {
                         
                if (genderArray[a] == 'M') numOfMales++; 
                if (genderArray[a] == 'F') numOfFemales++; 
                sum += ageArray[a];
            }
                        
            averageAge = (sum / ageArray.length); 

            var obj = {
                "businessName": businessName, 
                "numOfPeople": numOfPeople, 
                "averageAge": averageAge, 
                "numOfFemales": numOfFemales, 
                "numOfMales": numOfMales 
            }; 

            if (err) 
                callback(err, null, null)
            else 
                callback(null, obj, iteration); 
        }); 
    }

    function getCheckinsForEachLocation(businessName, data, iterationI, callback) {
        var retrieveLocationsWithCheckinsQuery = "SELECT * FROM checkins WHERE location_id = " + data[iterationI].location_id +  " AND TIMESTAMPDIFF(MINUTE, entered_at, current_timestamp) <= 10;";
        connection.query(retrieveLocationsWithCheckinsQuery, function(err, rows) {

            var averageAge = 0; 
            var genderArray = [];
            var ageArray = [];

            for(var j = 0; j < rows.length; j++) {
                    
                console.log("J " + j); 
                
                calculateCheckinsPerLocation(ageArray, genderArray, averageAge, businessName ,rows, j, function(err, result, iteration) {
                    if (err) {
                        callback(err, null, iteration); 
                    }

                    if (rows.length - 1 == iteration) {
                        callback(null, result, iterationI);
                    }
                }); 
            }
        }); 
    }

    function retrieveLocation(jsonObject, callback) {
        var locationsWithinVisibleMapRectQuery = "SELECT * FROM locations WHERE Y(coordinates) > " + req.body.SWCoordLat + "AND Y(coordinates) < " + req.body.NECoordLat + "AND X(coordinates) > " + req.body.SWCoordLong + "AND X(coordinates) < " + req.body.NECoordLong + ";";
        connection.query(locationsWithinVisibleMapRectQuery, function(err, rows) {
            if (err) throw err; 

            console.log("Number of businesses " + rows.length );
            for(var i = 0; i < rows.length; i++) {
                
                console.log("Business number " + i); 
                var businessName = rows[i].name;
                console.log(businessName);

            
                getCheckinsForEachLocation(businessName, rows, i, function(err, result, iterationI) {
                    if (err) {
                        callback(err, null, null); 
                    } else {
                        if (rows.length[i] == iterationI) 
                            console.log("Added");
                            jsonObject["BusinessDetails"].push(result);

                        if (rows.length - 1 == iterationI)
                            callback(null, result, iterationI, jsonObject);
                    }
                }); 
            }
        }); 
    }
    
    var jsonObject = {
         "BusinessDetails" : []
    };

    retrieveLocation(jsonObject, function(err, result, IterationI, jsonObject) {
        
            
        console.log(jsonObject);
         
        res.json(jsonObject);
        
    });

    
    

    //var locationsWithinVisibleMapRectQuery = "SELECT * FROM locations WHERE Y(coordinates) > " + req.body.SWCoordLat + "AND Y(coordinates) < " + req.body.NECoordLat + "AND X(coordinates) > " + req.body.SWCoordLong + "AND X(coordinates) < " + req.body.NECoordLong + ";";

    /*
function getLocationsInMapView(callback) {
        var locationsWithinVisibleMapRectQuery = "SELECT * FROM locations WHERE Y(coordinates) > " + req.body.SWCoordLat + "AND Y(coordinates) < " + req.body.NECoordLat + "AND X(coordinates) > " + req.body.SWCoordLong + "AND X(coordinates) < " + req.body.NECoordLong + ";";
        connection.query(locationsWithinVisibleMapRectQuery, function(err, rows, fields) {
                if (err) {
                    callback(err, null);
                } else {
                    callback(null, rows);
                }  
        });
    }

    getLocationsInMapView(function(err, result) {
        for(var i = 0; i < result.length; i++) {
            console.log(result[i].name);
        }
    });
    
    
    // NE TOP RIGHT
    // SW BOTTOM LEFT
    // X IS LONG
    // Y IS LAT
    //console.log("NElat: " + req.body.NECoordLat + ", NElong: " + req.body.NECoordLong); // TOP RIGHT 
    //console.log("SWlat: " + req.body.SWCoordLat + ", SWlong: " + req.body.SWCoordLong); // LEFT BOTTOM

    var jsonObject = {
        "BusinessDetails" : []
    };
    // Retrieve locations within the visible map rect 
    var locationsWithinVisibleMapRectQuery = "SELECT * FROM locations WHERE Y(coordinates) > " + req.body.SWCoordLat + "AND Y(coordinates) < " + req.body.NECoordLat + "AND X(coordinates) > " + req.body.SWCoordLong + "AND X(coordinates) < " + req.body.NECoordLong + ";";
    connection.query(locationsWithinVisibleMapRectQuery, function(err, rows, fields) {
        if (err) throw err; 
        console.log("Locations in map: " + rows.length);
        for (var i = 0; i < rows.length; i++) {
            var businessName = rows[i].name;
            console.log("I: " + i);
            // Returns all checkins for a location within the last 10 minutes
            var retrieveLocationsWithCheckinsQuery = "SELECT * FROM checkins WHERE location_id = " + rows[i].location_id +  " AND TIMESTAMPDIFF(MINUTE, entered_at, current_timestamp) <= 10;"; 
            connection.query(retrieveLocationsWithCheckinsQuery, function(err, rows, fields) {

                var averageAge = 0; 
                var numOfFemales = 0; 
                var numOfMales = 0;
                var numOfPeople = rows.length; 
                var genderArray = [];
                var ageArray = [];
    
                //console.log("Check ins for each location: " + rows.length);
                //console.log("Location number: " + i);

                for (var j = 0; j < rows.length; j++) {
                    console.log("J: " + j);
                    
                    console.log("Check-in: " + j + " User id: " + rows[j].user_id +  " location_id: " + rows[j].location_id + " entered_at: " + rows[j].entered_at);
                    
                    function calculateCheckins(callback) {
                    var getAgeAndGenderQuery = "SELECT gender, age FROM users WHERE user_id = " + rows[j].user_id + ";"; 
                    connection.query(getAgeAndGenderQuery, function(err, rows, fields) {
                        if (err) throw err; 
                        for (var z = 0; z < rows.length; z++) {
                            //console.log("Z: " + z);
                            numOfFemales = 0;  
                            numOfMales = 0; 
                            //console.log("Gender: " + rows[z].gender + " and Age: " + rows[z].age); 
                            genderArray.push(rows[z].gender); 
                            ageArray.push(rows[z].age); 
                        }

                        //console.log("gend length: " + genderArray.length);
                        //console.log("age length: "  + ageArray.length);
                        var sum = 0; 
                        for (var a = 0; a < ageArray.length; a++) {
                            //console.log( "Age array index : " +  a + " : " +  ageArray[a]);
                            if (genderArray[a] == 'M') numOfMales++; 
                            if (genderArray[a] == 'F') numOfFemales++; 
                            sum += ageArray[a];
                        }
                        //console.log("Sum:" + sum);
                        averageAge = (sum / ageArray.length); 

                        //console.log("Total number of people: " + numOfPeople);
                        //console.log("The average age is: " + averageAge); 
                        //console.log("Males: " + numOfMales);
                        //console.log("Females: " + numOfFemales); 
                        
                        // Add results to array  
                        //console.log(j + " == " + numberOfCheckins);
                        callback({"businessName": businessName, "numOfPeople": numOfPeople, "averageAge": averageAge, "numOfFemales": numOfFemales, "numOfMales": numOfMales });
                        
                    });

                    calculateCheckins(function(result) {
                        console.log("Result " + result);
                        jsonObject["BusinessDetails"].push(result);
                    });

                    console.log(jsonObject["BusinessDetails"]);
                }


                }
            });
        }
        res.json(jsonObject);
    });
    */ 
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

