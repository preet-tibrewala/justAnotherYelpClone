const jwt = require('jsonwebtoken')

const JWT_SECRET = 'thisisasecret'
const JWT_EXPIRATION = '24h'

exports.generateAuthToken = function (payload) {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRATION
    })
}

exports.requireAuthentication = function (req, res, next) {
    const authHeader = req.get("Authorization") || ""
    const authHeaderParts = authHeader.split(" ")
    const token = authHeaderParts[0] === "Bearer" ? authHeaderParts[1] : null

    try {
        const payload = jwt.verify(token, JWT_SECRET)
        req.user = payload
        next()
    }
    catch (err) {
        res.status(401).send({
            error: "Invalid authentication token provided."
        })
    }
}