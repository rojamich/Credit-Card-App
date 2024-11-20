// Setup
const fs = require("fs")
const express = require("express")
const app = express()
var exphbs = require('express-handlebars')
const port = process.env.PORT || 3000;

app.use(function(req, res, next) {
    console.log("== New Request");
    console.log(" -- URL:", req.url);
    console.log(" -- Body:", req.body);
    console.log("----------------------------------------------------");
    next();
});

app.engine('handlebars', exphbs.engine({ defaultLayout: 'main' }))
app.set('view engine', 'handlebars')

app.use(express.static('static'));
app.use(express.json());

/*----------------------------------------------------------------
Routes
----------------------------------------------------------------*/

app.get('/', function (req, res, next) {
    res.status(200).render('wallet')
  }) 

app.get('*', function (req, res, next) {
    res.status(404).render('404', {page: req.url})
})

const server = app.listen(port, () => {
    console.log(`Card Optimizer listening on port ${port}!`);
});