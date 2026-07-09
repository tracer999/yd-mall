const pool = require('../../config/db');

exports.getStats = async (req, res) => {
    try {
        const period = req.query.period || '24h'; // '24h', '7d', '30d'

        // 1. Define KST Helper
        const toKST = (date) => {
            const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
            const kstOffset = 9 * 60 * 60 * 1000;
            return new Date(utc + kstOffset);
        };

        const now = new Date();
        const nowKST = toKST(now);

        // 2. Determine Query Range and Grouping Logic
        let sqlCondition = '';
        let groupByFormat = ''; // For JS key generation
        let labelFormat = '';   // For Chart labels
        let loopCount = 0;
        let unit = '';          // 'hour' or 'day'

        if (period === '7d') {
            sqlCondition = 'INTERVAL 7 DAY';
            loopCount = 6; // 0 to 6 = 7 days
            unit = 'day';
        } else if (period === '30d') {
            sqlCondition = 'INTERVAL 30 DAY';
            loopCount = 29; // 0 to 29 = 30 days
            unit = 'day';
        } else {
            // Default 24h
            sqlCondition = 'INTERVAL 1 DAY';
            loopCount = 23; // 0 to 23 = 24 hours
            unit = 'hour';
        }

        // 3. Fetch raw data
        const [rows] = await pool.query(`
            SELECT visited_at, ip_address 
            FROM visitor_logs 
            WHERE visited_at >= NOW() - ${sqlCondition}
            ORDER BY visited_at ASC
        `);

        // 4. Bucket data in KST
        const dataMap = new Map();

        rows.forEach(row => {
            const d = toKST(new Date(row.visited_at));
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hour = String(d.getHours()).padStart(2, '0');

            let key = '';
            if (unit === 'hour') {
                key = `${year}-${month}-${day} ${hour}`;
            } else {
                key = `${year}-${month}-${day}`;
            }

            if (!dataMap.has(key)) {
                dataMap.set(key, new Set());
            }
            dataMap.get(key).add(row.ip_address);
        });

        // 5. Generate Labels and Data
        const labels = [];
        const data = [];

        // Reference point for loop (End time)
        const endTimeKST = new Date(nowKST);
        if (unit === 'hour') {
            endTimeKST.setMinutes(0, 0, 0, 0);
        } else {
            endTimeKST.setHours(0, 0, 0, 0); // Normalize to start of day for simpler day iteration
            // Actually, for daily stats, we usually want "Today", "Yesterday", etc.
            // If now is 21:00, "Today" covers 00:00~23:59.
        }

        for (let i = loopCount; i >= 0; i--) {
            let d;
            let key = '';
            let label = '';

            if (unit === 'hour') {
                d = new Date(endTimeKST.getTime() - i * 60 * 60 * 1000);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const hour = String(d.getHours()).padStart(2, '0');

                key = `${year}-${month}-${day} ${hour}`;
                label = `${hour}:00`;
            } else {
                d = new Date(endTimeKST.getTime() - i * 24 * 60 * 60 * 1000);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');

                key = `${year}-${month}-${day}`;
                label = `${month}-${day}`;
            }

            labels.push(label);
            const ips = dataMap.get(key);
            data.push(ips ? ips.size : 0);
        }

        res.render('admin/visitors/stats', {
            layout: 'layouts/admin_layout',
            title: '방문자 통계',
            currentPeriod: period,
            chartData: {
                labels: labels,
                data: data
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
