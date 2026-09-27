// ตัวเลือกของแต่ละคำถาม ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์ (validation) และหน้าเว็บ
(function (root) {
  const OPTIONS = {
    housingType: [
      { value: 'single', label: 'บ้านชั้นเดียว' },
      { value: 'multi', label: 'บ้านหลายชั้น' },
      { value: 'condo', label: 'หอพัก / คอนโด / แฟลต' },
    ],
    canSleep: [
      { value: 'yes', label: 'ได้' },
      { value: 'no', label: 'ไม่ได้' },
    ],
    waterLevel: [
      { value: 'none', label: 'ไม่มีน้ำท่วม' },
      { value: 'ankle', label: 'ต่ำกว่าข้อเท้า (ไม่เกิน 10 ซม.)' },
      { value: 'knee', label: 'ข้อเท้า – เข่า (10–50 ซม.)' },
      { value: 'waist', label: 'เข่า – เอว (50–100 ซม.)' },
      { value: 'chest', label: 'สูงกว่าเอว (เกิน 1 เมตร)' },
    ],
    commute: [
      { value: 'home_flooded', label: 'ที่พักน้ำท่วม ไม่สามารถมาทำงานได้' },
      { value: 'area_flooded', label: 'ที่พักน้ำไม่ท่วม แต่บริเวณโดยรอบได้รับผลกระทบ ไม่สามารถเดินทางได้' },
      { value: 'can_commute', label: 'ยังสามารถเดินทางมาทำงานได้' },
    ],
    helpLevel: [
      { value: 'relatives', label: '1. ต้องการออกจากที่พัก เพื่อไปอยู่บ้านญาติ' },
      { value: 'no_place', label: '2. ต้องการออกจากที่พัก แต่ยังไม่รู้ว่าจะไปพักที่ไหน' },
      { value: 'food_only', label: '3. ต้องการแค่อาหาร / น้ำดื่ม' },
    ],
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { OPTIONS };
  else root.OPTIONS = OPTIONS;
})(this);
