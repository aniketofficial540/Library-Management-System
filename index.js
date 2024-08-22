const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');
const fs = require('fs');
const app = express();

app.use(bodyParser.json());
app.use(express.static('public'));

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Aniket@12#34',
    database: 'library_db'
});

db.connect((err) => {
    if (err) {
        console.error('Failed to connect to the database:', err);
        process.exit(1);
    }
    console.log('Connected to the database');
});

// Function to check and update entries that don't have an outTime if the current time is past 4:30 PM or 10:00 PM
const updateOutTimeForLateEntries = () => {
    const currentTime = new Date();
    const currentHours = currentTime.getHours();
    const currentMinutes = currentTime.getMinutes();

    if (currentHours === 16 && currentMinutes === 30) {
        db.query('UPDATE logs SET outTime = "16:30:00" WHERE outTime IS NULL', (err, result) => {
            if (err) {
                console.error('Error updating outTime for late entries at 4:30 PM:', err);
            } else if (result.affectedRows > 0) {
                console.log(`Updated ${result.affectedRows} entries with default outTime of 4:30 PM`);
            }
        });
    }

    if (currentHours === 22) {
        db.query('UPDATE logs SET outTime = "22:00:00" WHERE outTime IS NULL', (err, result) => {
            if (err) {
                console.error('Error updating outTime for late entries at 10:00 PM:', err);
            } else if (result.affectedRows > 0) {
                console.log(`Updated ${result.affectedRows} entries with default outTime of 10:00 PM`);
            }
        });
    }
};

// Schedule this check to run every minute (or whenever appropriate)
setInterval(updateOutTimeForLateEntries, 1000); // Run every minute

app.get("/", (req, res) => {
    res.render("index.html");
});

app.post('/logEntry', (req, res) => {
    const collegeId = req.body.collegeId;

    db.query('SELECT name FROM students WHERE collegeId = ?', [collegeId], (err, result) => {
        if (err) {
            console.error('Database query error:', err);
            return res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
        if (result.length === 0) {
            return res.json({ success: false, message: 'Student not found' });
        }

        const studentName = result[0].name;
        const currentTime = new Date();
        const logDate = currentTime.toLocaleDateString('en-CA'); // 'en-CA' gives a format like 'YYYY-MM-DD'
        const hours = currentTime.getHours().toString().padStart(2, '0');
        const minutes = currentTime.getMinutes().toString().padStart(2, '0');
        const seconds = currentTime.getSeconds().toString().padStart(2, '0');

        const timeString = `${hours}:${minutes}:${seconds}`;

        db.query('SELECT * FROM logs WHERE collegeId = ? AND outTime IS NULL', [collegeId], (err, result) => {
            if (err) {
                console.error('Database query error:', err);
                return res.status(500).json({ success: false, message: 'Internal Server Error' });
            }
            if (result.length > 0) {
                db.query('UPDATE logs SET outTime = ? WHERE collegeId = ? AND outTime IS NULL', [timeString, collegeId], (err, updateResult) => {
                    if (err) {
                        console.error('Database query error:', err);
                        return res.status(500).json({ success: false, message: 'Internal Server Error' });
                    }
                    return res.json({ success: true, entry: { studentName, collegeId, logDate, inTime: result[0].inTime, outTime: timeString } });
                });
            } else {
                const inTime = timeString;
                db.query('INSERT INTO logs (collegeId, studentName, logDate, inTime) VALUES (?, ?, ?, ?)', [collegeId, studentName, logDate, inTime], (err, insertResult) => {
                    if (err) {
                        console.error('Database query error:', err);
                        return res.status(500).json({ success: false, message: 'Internal Server Error' });
                    }
                    return res.json({ success: true, entry: { studentName, collegeId, logDate, inTime } });
                });
            }
        });
    });
});

app.get('/download-csv', (req, res) => {
    const logDate = req.query.date;
    let query = 'SELECT * FROM logs';
    const queryParams = [];

    if (logDate) {
        query += ' WHERE logDate = ?';
        queryParams.push(logDate);
    }

    db.query(query, queryParams, (err, result) => {
        if (err) {
            console.error('Database query error:', err);
            return res.status(500).send('Internal Server Error');
        }

        result = result.map(row => {
            row.logDate = new Date(row.logDate).toLocaleDateString('en-CA'); // Format as 'YYYY-MM-DD'
            return row;
        });

        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(result);

        res.header('Content-Type', 'text/csv');
        res.attachment('log_data.csv');
        return res.send(csv);
    });
});

app.listen(5500, () => {
    console.log('Server running on port 5500');
});
