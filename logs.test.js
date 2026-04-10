require('dotenv').config();
const request = require('supertest');
const app = require('./logs'); // ดึงไฟล์เซิร์ฟเวอร์ของเรามาเทสต์


describe('🧪 ทดสอบระบบ Login API', () => {

    // 🟢 เคสที่ 1: ล็อกอินสำเร็จ (รหัสถูก)
    it('ควรคืนค่า 200 และสถานะ SUCCESS ถ้ารหัสผ่านถูกต้อง', async () => {
        const response = await request(app)
            .post('/login')
            .send({ 
                USER_ID: '101', // เปลี่ยนเป็นไอดีที่มีจริงในฐานข้อมูล
                PASSWORD: '1234' 
            });
                expect(response.statusCode).toBe(200);
                expect(response.body).toHaveProperty('status', 'success'); 
                expect(response.body).toHaveProperty('user'); 
    });

    // 🔴 เคสที่ 2: ใส่รหัสผ่านผิด
    it('ควรคืนค่า 401 และแจ้งว่ารหัสผ่านผิด', async () => {
        const response = await request(app)
            .post('/login')
            .send({ 
                USER_ID: '101', 
                PASSWORD: 'wrongpassword' 
            });

        expect(response.statusCode).toBe(401);
        expect(response.body).toHaveProperty('message', 'รหัสผ่านไม่ถูกต้อง');
    });

    // 🟠 เคสที่ 3: ไอดีนี้ถูกระงับการใช้งาน (DEACTIVATED)
    it('ควรคืนค่า 403 ถ้ายูสเซอร์ถูกระงับการใช้งาน', async () => {
        const response = await request(app)
            .post('/login')
            .send({ 
                USER_ID: '103', 
                PASSWORD: '1234' 
            });

       expect(response.statusCode).toBe(403);
               expect(response.body).toHaveProperty('message', 'บัญชีของคุณถูกระงับการใช้งาน'); 
    });

});