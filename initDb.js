/*
 * This file contains a simple script to populate the database with initial
 * data from the files in the data/ directory.  The following environment
 * variables must be set to run this script:
 *
 *   MONGO_DB - The name of the database into which to insert data.
 *   MONGO_USER - The user to use to connect to the MongoDB server.
 *   MONGO_PASSWORD - The password for the specified user.
 *   MONGO_AUTH_DB - The database where the credentials are stored for
 *     the specified user.
 *
 * You will need to make sure the specified user exists by creating them
 * through `mongosh`.
 */

require('dotenv').config()

const { connectToDb, closeDbConnection } = require('./lib/mongo')
const { bulkInsertNewBusinesses } = require('./models/business')

const businessData = require('./data/businesses.json')

connectToDb().then(async function () {
    /*
     * Insert initial business data into the database
     */
    const ids = await bulkInsertNewBusinesses(businessData)
    console.log("== Inserted businesses with IDs:", ids)

    closeDbConnection(function () {
        console.log("== DB connection closed")
    })
})
