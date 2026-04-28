// ==========================================
// Dashboard.gs: ดึงสถิติหน้า Dashboard แยกตามสิทธิ์
// ==========================================
function handleGetDashboardStats(request) {
  const caseSheet = SpreadsheetApp.openById(CASE_DB_ID).getSheetByName("Cases");
  if (!caseSheet) throw new Error("ไม่พบ Sheet ชื่อ Cases ในไฟล์ฐานข้อมูลเคส");

  // ดึงข้อมูลสิทธิ์ที่ผ่านการตรวจสอบอย่างแน่นหนาจาก Code.gs มาใช้ (ตัดการอิงข้อมูลจากหน้าเว็บทิ้งไปเลย)
  const userFullName = request.verifiedUser.fullName;
  const userRoleStr = request.verifiedUser.roleStr;
  const responsibility = request.verifiedUser.responsibility;

  let roleLevel = 1;
  if (userRoleStr.includes("ผู้ดูแลระบบ")) roleLevel = 4;
  else if (userRoleStr.includes("เจ้าหน้าที่ระเบียบวินัย")) roleLevel = 3;
  else if (userRoleStr.includes("หัวหน้าระดับ")) roleLevel = 2;
  else if (userRoleStr.includes("ที่ปรึกษา")) roleLevel = 1;
  else if (!isNaN(userRoleStr)) roleLevel = parseInt(userRoleStr);

  const data = caseSheet.getDataRange().getDisplayValues();
  let total = 0, pending = 0, inProgress = 0, done = 0, cases = [];

  const getLevels = (text) => {
    let hasMS = !!(text.match(/ม\.[1-3]/) || text.match(/(?:^|[^0-9])([1-3])\//) || text.match(/^([1-3])$/));
    let hasHS = !!(text.match(/ม\.[4-6]/) || text.match(/(?:^|[^0-9])([4-6])\//) || text.match(/^([4-6])$/));
    return { hasMS, hasHS };
  };

  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue; // ข้ามบรรทัดว่าง
    const cClass = String(data[i][5]), cInvolved = String(data[i][6]);
    const allText = cClass + " " + cInvolved;
    
    let canAccess = false;
    if (roleLevel >= 3) canAccess = true;
    else if (userRoleStr.includes("หัวหน้าระดับ")) {
      const lvls = getLevels(allText);
      const isMSHead = userRoleStr.includes("ม.ต้น") || responsibility.includes("ม.ต้น");
      const isHSHead = userRoleStr.includes("ม.ปลาย") || responsibility.includes("ม.ปลาย");
      if ((isMSHead && lvls.hasMS) || (isHSHead && lvls.hasHS) || (!isMSHead && !isHSHead)) canAccess = true;
    } else if (userRoleStr.includes("ที่ปรึกษา")) {
      if (responsibility) {
         const escapedRes = responsibility.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
         if (new RegExp(escapedRes + '(?![0-9])').test(allText)) canAccess = true;
      }
    } else canAccess = true; 

    if (canAccess) {
      total++; const status = data[i][11]; 
      if (status === "รับเรื่องแล้ว") pending++; else if (status === "กำลังดำเนินการ") inProgress++; else if (status === "ดำเนินการแล้ว") done++;
      cases.push({ caseId: data[i][0], incidentDate: data[i][1], incidentTime: data[i][2], studentId: data[i][3], studentName: data[i][4], classRoom: data[i][5], involvedStudents: data[i][6], behaviorType: data[i][7], viceType: data[i][8], caseDetails: data[i][9], recorderName: data[i][10], status: data[i][11], timestamp: data[i][12] });
    }
  }
  return { status: "success", total, pending, inProgress, done, cases };
}