const { Router } = require('express')

const businessesRouter = require('./businesses').router
const reviewsRouter = require('./reviews').router
const photosRouter = require('./photos').router
const usersRouter = require('./users').router
const mediaRouter = require('./media').router

const router = Router()
router.use('/media', mediaRouter)
router.use('/businesses', businessesRouter)
router.use('/reviews', reviewsRouter)
router.use('/photos', photosRouter)
router.use('/users', usersRouter)

module.exports = router
