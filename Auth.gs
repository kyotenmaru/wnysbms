// ==========================================
// Auth.gs: ระบบยืนยันตัวตนและตรวจสอบ Token
// ==========================================
function handleLogin(request) {
  const userSheet = SpreadsheetApp.openById(USER_DB_ID).getSheetByName("Users");
  if (!userSheet) throw new Error("ไม่พบ Sheet สำหรับตรวจสอบผู้ใช้งาน");
  
  // เร่งความเร็วด้วย TextFinder ค้นหาเฉพาะคอลัมน์ A (Username)
  const match = userSheet.getRange("A:A").createTextFinder(request.username).matchEntireCell(true).findNext();
  
  if (match) {
    const rowIndex = match.getRow();
    const rowData = userSheet.getRange(rowIndex, 1, 1, 7).getValues()[0];
    
    if (String(rowData[0]) === request.username && String(rowData[1]) === request.password) {
      const roleStr = String(rowData[3]);
      let roleLevel = 1;
      if (roleStr.includes("ผู้ดูแลระบบ")) roleLevel = 4;
      else if (roleStr.includes("เจ้าหน้าที่ระเบียบวินัย")) roleLevel = 3;
      else if (roleStr.includes("หัวหน้าระดับ")) roleLevel = 2;
      else if (roleStr.includes("ที่ปรึกษา")) roleLevel = 1;
      else if (!isNaN(roleStr)) roleLevel = parseInt(roleStr);

      const responsibility = rowData.length > 6 ? String(rowData[6]).trim() : "";
      const token = "token-" + Utilities.getUuid();
      userSheet.getRange(rowIndex, 5).setValue(token);

      return { status: "success", token: token, fullName: rowData[2], role: roleStr, roleLevel: roleLevel, responsibility: responsibility };
    }
  }
  return { status: "error", message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };
}

// ==========================================
// ตรวจสอบ Token ว่ามีอยู่จริงในระบบหรือไม่
// ==========================================
function validateToken(token) {
  if (!token) return { isValid: false };
  const userSheet = SpreadsheetApp.openById(USER_DB_ID).getSheetByName("Users");
  
  // เร่งความเร็วด้วย TextFinder หา Token ในคอลัมน์ E
  const match = userSheet.getRange("E:E").createTextFinder(token).matchEntireCell(true).findNext();
  
  if (match) {
    // หากพบ Token ของจริง ให้ดึงสิทธิ์และหน้าที่จากหลังบ้านส่งกลับไปให้ระบบใช้ (ปลอดภัย 100%)
    const rowData = userSheet.getRange(match.getRow(), 1, 1, 7).getValues()[0];
    const roleStr = String(rowData[3]);
    
    // แปลงชื่อสิทธิ์เป็นระดับตัวเลข (roleLevel) เพื่อนำไปเช็คความปลอดภัยที่ Code.gs
    let roleLevel = 1;
    if (roleStr.includes("ผู้ดูแลระบบ")) roleLevel = 4;
    else if (roleStr.includes("เจ้าหน้าที่ระเบียบวินัย")) roleLevel = 3;
    else if (roleStr.includes("หัวหน้าระดับ")) roleLevel = 2;
    else if (roleStr.includes("ที่ปรึกษา")) roleLevel = 1;
    else if (!isNaN(roleStr)) roleLevel = parseInt(roleStr);

    return {
      isValid: true,
      fullName: rowData[2],
      roleStr: roleStr,
      roleLevel: roleLevel,
      responsibility: rowData.length > 6 ? String(rowData[6]).trim() : ""
    };
  }
  return { isValid: false };
}

// ==========================================
// ออกจากระบบ (เคลียร์ Token ออกจากฐานข้อมูล)
// ==========================================
function handleLogout(request) {
  const userSheet = SpreadsheetApp.openById(USER_DB_ID).getSheetByName("Users");
  
  const match = userSheet.getRange("E:E").createTextFinder(request.token).matchEntireCell(true).findNext();
  if (match) {
    match.clearContent();
  }
  return { status: "success", message: "ออกจากระบบสำเร็จ" }; // ถึงหาไม่เจอก็ถือว่าปลอดภัยแล้ว
}