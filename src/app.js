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

// 7
app.get('/admin/best-clients', getProfile ,async (req, res) => {
    const {Contract, Job, Profile} = req.app.get('models')
    const start = req.query.start;
    const end = req.query.end;
    const limit = req.query.limit || 2;

    console.log('limit', limit)
    const dateRegex =/(\d{4})\-(\d{2})\-(\d{2})/

    const [,startYear, startMonth, startDay ] = start.match(dateRegex)
    const [,endYear, endMonth, endDay ] = end.match(dateRegex)
    const startDate = new Date(startYear, startMonth, startDay)
    const endDate = new Date(endYear, endMonth, endDay)

    const jobs = await Job.findAll({
        attributes: [
            'price',
            [sequelize.fn('sum', sequelize.col('price')), 'total_amount']
        ],
        group: ['ClientId'],
        order: [
            ['total_amount', 'DESC'],
        ],
        limit: limit,
        where: {
        [Op.and]: [
            {paymentDate: {
                [Op.gt]: [startDate.toISOString()],
            }},
            {paymentDate: {
                [Op.lt]: [endDate],
            }}
        ]
        },
        include: [{
            model: Contract,
            required: true,
            include: [{
                model: Profile,
                as: "Client",
                required: true
            }]
        }]
    })

    const clients = jobs.map((job) => {
        return {
            id: job["Contract"]["Client"].id,
            fullName: `${job["Contract"]["Client"].firstName} ${job["Contract"]["Client"].lastName}`,
            paid: job["price"]
    }
    })

    res.json(clients)
})

// Example call curl http://localhost:3001/admin/best-profession\?start=2020-08-10\&end\=2020-08-14 -H "profile_id:1"
//6
app.get('/admin/best-profession',getProfile ,async (req, res) => {

    const {Contract, Job, Profile} = req.app.get('models')
    const start = req.query.start;
    const end = req.query.end;

    const dateRegex =/(\d{4})\-(\d{2})\-(\d{2})/

    const [,startYear, startMonth, startDay ] = start.match(dateRegex)
    const [,endYear, endMonth, endDay ] = end.match(dateRegex)
    const startDate = new Date(startYear, startMonth, startDay)
    const endDate = new Date(endYear, endMonth, endDay)

    const jobs = await Job.findAll({
        attributes: [
            'price',
            [sequelize.fn('sum', sequelize.col('price')), 'total_amount']
        ],
        group: ['ClientId'],
        order: [
            ['total_amount', 'DESC'],
        ],
        where: {
        [Op.and]: [
            {paymentDate: {
                [Op.gt]: [startDate.toISOString()],
            }},
            {paymentDate: {
                [Op.lt]: [endDate],
            }}
        ]
        },
        include: [{
            model: Contract,
            required: true,
            include: [{
                model: Profile,
                as: "Client",
                attributes: ['profession'],
                required: true
            }]
        }]
    })

    const resultMaximumProfession = jobs[0]["Contract"]["Client"]["profession"];
    res.json({profession: resultMaximumProfession})
})

// 5
app.post('/balances/deposit/:userId',getProfile ,async (req, res) => {
    sequelize.transaction(async (t) => {
        const {Contract, Job, Profile} = req.app.get('models')
        const { userId } = req.params
        const {amount} = req.body
        
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
        , transaction: t})

        if(!jobs) return res.status(404).end()
        const totalOfJobs = 
            jobs.reduce((acc, currentValue) => acc + currentValue.price, 0)

        const MAXIMUMDEPOSITPERCENTAGE = 0.25
        const maximumDeposit = totalOfJobs * MAXIMUMDEPOSITPERCENTAGE
        const depositAmount = Number(amount)

        if(depositAmount > maximumDeposit){
            return res.status(404).end()
        }

        const client = await Profile.findOne({where: {id: userId}})
        const clientBalance = client.balance

        await Profile.update(
            {balance: clientBalance + depositAmount},
            {where: {id: userId}, transaction: t})
        
        res.json({message: "the deposit was successful"})
    })
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
            return res.status(404).end()
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
            return res.status(404).end()
        }
        
        const contractorId = contract.ContractorId
        const contractor = await Profile.findOne({where : {id: contractorId}})

        await Job.update({paid: true}, {where: {id: job_id}, transaction: t})
        await Profile.update(
            {balance: clientBalance - amountToPay},
            {where: {id: userId}, transaction: t})

        await Profile.update(
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
