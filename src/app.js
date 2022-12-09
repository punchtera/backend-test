const express = require('express');
const bodyParser = require('body-parser');
const { Op } = require("sequelize");
const {sequelize} = require('./model')
const {getProfile} = require('./middleware/getProfile')
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

app.get('/', (_, res) => {
    res.send('hello world');
})

// 4
app.post('/jobs/:job_id/pay',getProfile ,async (req, res) => {
    sequelize.transaction(async (t) => {
        const {Profile, Job, Contract} = req.app.get('models')
        const userId = req.profile.id
        const { job_id } = req.params
    
        const job = await Job.findOne({where: {id: job_id}})
        const contract = await Contract.findOne({where : {id: job.ContractId}})

        if(job.paid == true){
            res.json({message: "the job was already paid"})
        }

        const amountToPay = job.price

        const client = await Profile.findOne(
            {where: {
                [Op.and]: [
                    {id: userId},
                    {type: 'client'}
        ]}    })

        const clientBalance = client.balance
        
        if(clientBalance < amountToPay) {
            res.json({message: "the balance is less than the amount to paid"})
        }
        
        const contractorId = contract.ContractorId
        const contractor = await Profile.findOne({where : {id: contractorId}})

        await Job.Update({paid: true}, {where: {id: job_id}, transaction: t})
        await Profile.Update(
            {balance: clientBalance - amountToPay},
            {where: {id: userId}, transaction: t})

        await Profile.Update(
            {balance: contractor.balance + amountToPay},
            {where: {id: contractorId}, transaction: t})
        
        res.json({message: "the job has been paid"})
    })
})

// 3
app.get('/jobs/unpaid',getProfile ,async (req, res) =>{
    const {Contract, Job} = req.app.get('models')
    const userId = req.profile.id

    const jobs = await Job.findAll({
        where: {
            paid: {
                [Op.not]: true
            }
        }, include: [{
            model: Contract,
            where: {
                    [Op.or]: [
                        {  clientId: userId, },
                        { contractorId: userId }
                    ],
                    status: {
                        [Op.not]: 'terminated'
                    }
                }
           }]
    })
    if(!jobs) return res.status(404).end()
    res.json(jobs)
})

// 2
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

// 1
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
