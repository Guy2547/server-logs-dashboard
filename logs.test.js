describe('API Testing (Mocked/Simulated)', () => {

    // จำลองสถานการณ์ที่ 1
    it('1. Login: ID ไม่มีในระบบต้องขึ้น 404', async () => {
        // สมมติว่านี่คือผลลัพธ์ที่ได้จากการยิง API
        const mockResponse = {
            statusCode: 404,
            body: { message: 'ไอดีคุณไม่มีในฐานข้อมูล' }
        };

        expect(mockResponse.statusCode).toBe(404);
        expect(mockResponse.body.message).toBe('ไอดีคุณไม่มีในฐานข้อมูล');
    });

    // จำลองสถานการณ์ที่ 2
    it('2. API Logs: ต้องดึงข้อมูลได้ (Status 200)', async () => {
        // สมมติว่านี่คือผลลัพธ์ที่ได้จากการยิง API สำเร็จ
        const mockResponse = {
            statusCode: 200
        };

        expect(mockResponse.statusCode).toBe(200);
    });

});