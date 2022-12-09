const express = require('express');
const bodyParser = require('body-parser');
const { Op } = require("sequelize");
const {sequelize} = require('./model')
const {getProfile} = require('./middleware/getProfile')
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

/**
 * FIX ME!
 * @returns contract by id
 */

app.get('/', (req, res) => {
    res.send('hello world');
})

app.get('/contracts',getProfile ,async (req, res) =>{
    const {Contract} = req.app.get('models')
    const clientId = req.profile.id

    const contracts = await Contract.findAll({
        where: {
            clientId: clientId,
            status: {
                [Op.not]: 'terminated'
            }
        }
    })
    if(!contracts) return res.status(404).end()
    res.json(contracts)
})

app.get('/contracts/:id',getProfile ,async (req, res) =>{
    const {Contract} = req.app.get('models')
    const { id: contractId } = req.params
    const clientId = req.profile.id
    
    const contract = await Contract.findOne({
        where: {
            id: contractId,
            clientId: clientId
        }
    })
    if(!contract) return res.status(404).end()
    res.json(contract)
})
module.exports = app;
