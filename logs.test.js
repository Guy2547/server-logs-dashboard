process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('./logs');

describe('API Testing (Database Synced)', () => {
    
    it('1. Login: ID ไม่มีในระบบต้องขึ้น 404', async () => {
        const res = await request(app)
            .post('/login')
            .send({ USER_ID: '999', PASSWORD: '123' });
        expect(res.statusCode).toBe(404);
        expect(res.body.message).toBe('ไอดีคุณไม่มีในฐานข้อมูล');
    });

    it('2. API Logs: ต้องดึงข้อมูลได้ (Status 200)', async () => {
        const res = await request(app).get('/all-logs');
        // ถ้ารันในเครื่องที่ต่อ DB ได้ ต้องได้ 200
        // ถ้า Test สภาพแวดล้อมจำลอง อาจต้องใช้ Mock ข้อมูล
        expect(res.statusCode).toBe(200); 
    });
});