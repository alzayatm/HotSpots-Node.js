
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
    
    console.log(req.body.longitude);
    console.log(req.body.latitude);
    var proceedToUpdateUsersLocation = true
    // " AND entered_at <= now() AND entered_at > now()-50;"
    // AND entered_at <= now() AND entered_at >= date_sub(now(),  interval 1 SECOND);
    // AND DATE_SUB(entered_at, INTERVAL 3.999999 SECOND_MICROSECOND);
    var checkIfDuplicateQuery = "SELECT * FROM checkins WHERE user_id = " + req.body.userID + " AND DATE_SUB(curtime(6), INTERVAL 4.03000 SECOND_MICROSECOND) < entered_at;";    //TIMESTAMPDIFF(SECOND, entered_at, current_timestamp(6)) < 5;";
    connection.query(checkIfDuplicateQuery, function(err, rows, fields) {
        if (err) throw err; 
        
        console.log("Value of rows.length: " + rows.length);
        if (rows.length > 0) 
            proceedToUpdateUsersLocation = false; // A duplicate record exists, do not update table

        console.log("Value of proceed to update: " + proceedToUpdateUsersLocation);
        if (proceedToUpdateUsersLocation) {
            
            // Check if closest location exists in locations table 
            var queryClosestLocation = "SELECT * FROM locations WHERE ST_Distance_Sphere(POINT(" + req.body.longitude + "," + req.body.latitude + "), coordinates) <= 20;";
            connection.query(queryClosestLocation, function(err, rows, fields) {
                if (err) throw err; 
                // If rows.length > 0, the location closest to the user exists in the table 
                if (rows.length > 0) {
                    console.log("Location already exists in table");
                    console.log("Number of existing locations already in table: " + rows.length);
                    // Retrieve the location ID 
                    var locationID = rows[0].location_id; 
                    // Make a query to add the user to that location 
                    var addUserToLocationQuery = "INSERT INTO checkins (user_id, location_id) VALUES(" + req.body.userID + "," + locationID + ");"; 
                    connection.query(addUserToLocationQuery, function(err, rows, fields) { if (err) throw err; })
                } else {
                    // The location does not exist in the table, we make a call to google api for that location 
                    console.log("Location does not exist, fetching from google api");
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
                                    if (typeOfLocation != "route" && typeOfLocation != "locality" && typeOfLocation != "political" && typeOfLocation != "neighborhood") {

                                        var longitude = json.results[i].geometry.location.lng; 
                                        var latitude = json.results[i].geometry.location.lat; 
                                        var address = json.results[i].vicinity.replace(/'+/g, ""); 
                                        var name = json.results[i].name.replace(/'+/g, ""); 

                                        // Add the location query 
                                        var addLocationQuery = "INSERT INTO locations (coordinates, name, address) VALUES(POINT(" + longitude + "," + latitude + "),\'" + name + "\', \'" + address  + "\');";
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
        res.status(200).end();
    });
}); 

// Returns a list of hotspots around the users location
app.post('/gethotspots', function(req, res) {

    function calculateCheckinsPerLocation(businessAddress, x, y, ageArray, genderArray ,averageAge ,businessName ,data, iteration ,callback) {
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
            
            averageAge = Math.round((sum / ageArray.length)); 

            var percentFemale =  Math.round(100 * (numOfFemales / (numOfFemales + numOfMales))); 
            var percentMale = Math.round(100 * (numOfMales / (numOfFemales + numOfMales))); 

            var obj = {  
                "coordinates" : {
                    "x": x, 
                    "y": y
                }, 
                "business_details" : {
                    "business_name": businessName, 
                    "business_address": businessAddress,
                    "num_of_people": numOfPeople, 
                    "average_age": averageAge, 
                    "num_of_females": numOfFemales, 
                    "num_of_males": numOfMales, 
                    "percent_female": percentFemale, 
                    "percent_male": percentMale
                }
             }; 

            if (err) {
                callback(err, null, null)
            }
            else {
                callback(null, obj, iteration); 
            }
        }); 
    }

    function getCheckinsForEachLocation(businessAddress, x, y, businessName, data, iterationI, callback) {
        var retrieveLocationsWithCheckinsQuery = "SELECT * FROM checkins WHERE location_id = " + data[iterationI].location_id +  " AND TIMESTAMPDIFF(MINUTE, entered_at, current_timestamp) < 10;";
        connection.query(retrieveLocationsWithCheckinsQuery, function(err, rows) {
    
            var averageAge = 0; 
            var genderArray = [];
            var ageArray = [];
            
            if (rows.length == 0) {
                callback(null, null);
            } else {

                for(var j = 0; j < rows.length; j++) {
                
                    console.log("J " + j); 
                
                    calculateCheckinsPerLocation(businessAddress, x, y, ageArray, genderArray, averageAge, businessName ,rows, j, function(err, obj, iteration) {
                        if (err) {
                            callback(err, null); 
                        }

                        if (rows.length - 1 == iteration) {
                            callback(null, obj);
                        }
                    }); 
                }
            }
        }); 

    }

    function retrieveLocation(callback) {
        var locationsWithinVisibleMapRectQuery = "SELECT * FROM locations WHERE Y(coordinates) > " + req.body.SWCoordLat + "AND Y(coordinates) < " + req.body.NECoordLat + "AND X(coordinates) > " + req.body.SWCoordLong + "AND X(coordinates) < " + req.body.NECoordLong + ";";
        connection.query(locationsWithinVisibleMapRectQuery, function(err, rows) {
            if (err) throw err; 

            var jsonObject = {
                "results" : []
            };

            console.log("Number of businesses: " + rows.length);
            if (rows.length == 0) {
                callback(null, null);
            } else {
                for(var i = 0; i < rows.length; i++) {
               
                    console.log("Business number " + i); 
                    var businessName = rows[i].name;
                    var businessAddress = rows[i].address; 
                    console.log(businessName);
                    console.log(businessAddress);
                    console.log();
                    var x = rows[i].coordinates.x; 
                    var y = rows[i].coordinates.y; 
                
                    getCheckinsForEachLocation(businessAddress, x, y, businessName, rows, i, function(err, obj) {
                    
                        if (err) {
                            callback(err, null); 
                        }  
                
                        jsonObject["results"].push(obj);

                        console.log(jsonObject["results"].length  + " == " + rows.length);
                        console.log(jsonObject["results"]);
                        if (jsonObject["results"].length == rows.length) { 
                            callback(null, jsonObject);  
                         } 

                    }); 
                }
            }
        }); 
    }

    retrieveLocation(function(err, jsonObject) {
        if (err) throw err; 
        console.log("===== FINAL RESULT ====="); 
        if (jsonObject == null) {
            console.log("No data to send back");
            res.status(200).end();
        } else {
            console.log("Data sent back");
            console.log(jsonObject["results"]);
            res.json(jsonObject).status(200).end();
        }
    });
});



// Returns information about a particular location the user searched for 
app.get('/search', function(req, res) {
    // Returning a specific location and the information about it
    // Might need to send information about the particular business requested 
    // Send long and lat, search within distance, and return calculated results for searched results
    res.status(200).json({"name": "Mihad"});
});

app.post('/updateage', function(req, res) {

    var changeAgeQuery = "UPDATE users SET age = " + req.body.age + " WHERE user_id = " + req.body.userID + ";"; 
    connection.query(changeAgeQuery, function(err, rows) {
        if (err) throw err; 
        res.status(200);
        res.end();
    }); 
});

app.post('/updategender', function(req, res) {

    var updateGenderQuery = "UPDATE users SET gender = \'" + req.body.gender + "\' WHERE user_id = " + req.body.userID + ";"; 
    connection.query(updateGenderQuery, function(err, rows) {
        if (err) throw err; 
        res.status(200);
        res.end();
    });
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

