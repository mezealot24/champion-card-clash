-- Sonic Bliz (Q 2026-10-16 07:00Z): Extra Hits replaced by Acceleration (Strike meets Strike → Energy full + draw 2).
update champion_styles set effect = 'เริ่มเกมพร้อมการ์ด 3 ใบบน Field
Acceleration: ถ้าเกิด Dual Strike (เรากับศัตรู Strike ในเทิร์นเดียวกัน) → Energy เต็ม และจั่วการ์ด 2 ใบ ตอนจบเทิร์น
Overdrive: Strike ตอน Field เต็ม 5 ใบ และไม่มีการ์ด S ในสาย → ใช้ Energy ที่เหลือทั้งหมด การ์ดทุกใบในสาย +2 dmg ต่อ Energy 1 (Silence ไม่หยุด)' where champion_id = 'AS' and slot = 1;
