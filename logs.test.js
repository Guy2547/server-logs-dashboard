require('dotenv').config();
const request = require('supertest');
const app = require('./app'); 
const bcrypt = require('bcrypt'); // นำเข้า bcrypt มาสร้างรหัสผ่านจำลอง

// "สตันท์แมน" (Mock) มาแทนที่แพ็กเกจ pg
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

 
const { Pool } = require('pg');
const pool = new Pool(); 

describe('🧪 ทดสอบระบบ Login API (Mock Database)', () => {

    // 🌟 2. ล้างความจำของสตันท์แมนก่อนเริ่มเทสต์แต่ละข้อ (จะได้ไม่ตีกัน)
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // 🟢 เคสที่ 1: ล็อกอินสำเร็จ (รหัสถูก)
    it('ควรคืนค่า 200 และสถานะ SUCCESS ถ้ารหัสผ่านถูกต้อง', async () => {
        // สร้างรหัสผ่าน '1234' ที่ถูกเข้ารหัสแล้ว
        const hashedPassword = await bcrypt.hash('1234', 10);
        
        pool.query.mockResolvedValueOnce({
            rows: [{ user_id: '101', password: hashedPassword, status: 'ACTIVE' }]
        });

        const response = await request(app)
            .post('/login')
            .send({ 
                USER_ID: '101', 
                PASSWORD: '1234' 
            });
            
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('status', 'success'); 
        expect(response.body).toHaveProperty('user'); 
    });

    // 🔴 เคสที่ 2: ใส่รหัสผ่านผิด
    it('ควรคืนค่า 401 และแจ้งว่ารหัสผ่านผิด', async () => {
        const hashedPassword = await bcrypt.hash('1234', 10);
        
        pool.query.mockResolvedValueOnce({
            rows: [{ user_id: '101', password: hashedPassword, status: 'ACTIVE' }]
        });

        const response = await request(app)
            .post('/login')
            .send({ 
                USER_ID: '101', 
                PASSWORD: 'wrongpassword' // แต่เราแกล้งส่งรหัสผิดไป
            });

        expect(response.statusCode).toBe(401);
        expect(response.body).toHaveProperty('message', 'รหัสผ่านไม่ถูกต้อง');
    });

    // 🟠 เคสที่ 3: ไอดีนี้ถูกระงับการใช้งาน (DEACTIVATED)
    it('ควรคืนค่า 403 ถ้ายูสเซอร์ถูกระงับการใช้งาน', async () => {
        const hashedPassword = await bcrypt.hash('1234', 10);
        
        pool.query.mockResolvedValueOnce({
            rows: [{ user_id: '103', password: hashedPassword, status: 'DEACTIVATED' }]
        });

        const response = await request(app)
            .post('/login')
            .send({ 
                USER_ID: '103', 
                PASSWORD: '1234' 
            });
            
       expect(response.statusCode).toBe(403);
       // อย่าลืมเช็คข้อความให้ตรงกับที่คุณเขียนไว้ใน API จริงๆ ด้วยนะครับ
       expect(response.body).toHaveProperty('message', 'บัญชีของคุณถูกระงับการใช้งาน'); 
    });

});