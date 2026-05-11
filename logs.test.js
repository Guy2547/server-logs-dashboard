require('dotenv').config();
const request = require('supertest');
const { app } = require('./app');
const bcrypt = require('bcrypt');

// 🌟 1. อัปเกรด Mock ให้ครอบคลุมทั้งการใช้ pool.query และ pool.connect
jest.mock('pg', () => {
  const mClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const mPool = {
    query: jest.fn(),
    connect: jest.fn(() => mClient),
  };
  return { Pool: jest.fn(() => mPool) };
});

const { Pool } = require('pg');
const pool = new Pool(); 

describe('🧪 ทดสอบระบบ Login API (Mock Database)', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // 🟢 เคสที่ 1: ล็อกอินสำเร็จ
    it('ควรคืนค่า 200 และสถานะ SUCCESS ถ้ารหัสผ่านถูกต้อง', async () => {
        const hashedPassword = await bcrypt.hash('1234', 10);
        
        // 🌟 2. ใส่ข้อมูลจำลองทั้งพิมพ์เล็กและพิมพ์ใหญ่ โค้ดคุณเรียกใช้แบบไหนก็รอด!
        const mockData = {
            rows: [{ 
                user_id: '101', USER_ID: '101', 
                password: hashedPassword, PASSWORD: hashedPassword, 
                status: 'ACTIVE', STATUS: 'ACTIVE' 
            }]
        };

        // สั่งให้ตอบกลับด้วย mockData เสมอ ไม่ว่าจะต่อฐานข้อมูลด้วยวิธีไหน
        pool.query.mockResolvedValue(mockData);
        const client = await pool.connect();
        client.query.mockResolvedValue(mockData);

        const response = await request(app)
            .post('/login')
            .send({ USER_ID: '101', PASSWORD: '1234' });
            
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('status', 'success'); 
    });

    // 🔴 เคสที่ 2: ใส่รหัสผ่านผิด
    it('ควรคืนค่า 401 และแจ้งว่ารหัสผ่านผิด', async () => {
        const hashedPassword = await bcrypt.hash('1234', 10);
        
        const mockData = {
            rows: [{ 
                user_id: '101', USER_ID: '101', 
                password: hashedPassword, PASSWORD: hashedPassword, 
                status: 'ACTIVE', STATUS: 'ACTIVE' 
            }]
        };

        pool.query.mockResolvedValue(mockData);
        const client = await pool.connect();
        client.query.mockResolvedValue(mockData);

        const response = await request(app)
            .post('/login')
            .send({ USER_ID: '101', PASSWORD: 'wrongpassword' });

        expect(response.statusCode).toBe(401);
        expect(response.body).toHaveProperty('message', 'รหัสผ่านไม่ถูกต้อง');
    });

    // 🟠 เคสที่ 3: ไอดีนี้ถูกระงับการใช้งาน
    it('ควรคืนค่า 403 ถ้ายูสเซอร์ถูกระงับการใช้งาน', async () => {
        const hashedPassword = await bcrypt.hash('1234', 10);
        
        const mockData = {
            rows: [{ 
                user_id: '103', USER_ID: '103', 
                password: hashedPassword, PASSWORD: hashedPassword, 
                status: 'DEACTIVATED', STATUS: 'DEACTIVATED' 
            }]
        };

        pool.query.mockResolvedValue(mockData);
        const client = await pool.connect();
        client.query.mockResolvedValue(mockData);

        const response = await request(app)
            .post('/login')
            .send({ USER_ID: '103', PASSWORD: '1234' });
            
       expect(response.statusCode).toBe(403);
       expect(response.body).toHaveProperty('message', 'บัญชีของคุณถูกระงับการใช้งาน'); 
    });
});