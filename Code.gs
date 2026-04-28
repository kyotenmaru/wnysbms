// ==========================================
// Code.gs (Main Router): ตัวควบคุมเส้นทาง API และตรวจสอบสิทธิ์
// ==========================================
function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    const request = JSON.parse(e.postData.contents);
    const action = request.action;

    if (action === "login") {
      return output.setContent(JSON.stringify(handleLogin(request)));
    }

    if (!request.token) {
       return output.setContent(JSON.stringify({ status: "error", message: "ไม่มีสิทธิ์เข้าถึง" }));
    }

    // ==========================================
    // นำแนวคิดจาก logings.txt: ตรวจสอบ Token กับฐานข้อมูลว่าถูกต้องจริงหรือไม่
    // ==========================================
    const tokenValidation = validateToken(request.token);
    
    if (!tokenValidation.isValid) {
      return output.setContent(JSON.stringify({ status: "error", message: "Access Denied: เซสชันไม่ถูกต้อง หรือหมดอายุ" }));
    }

    // แนบข้อมูลผู้ใช้งาน "ของแท้จากฐานข้อมูล" ไปใน Request เพื่อให้ฟังก์ชันอื่นๆ นำไปใช้ต่อได้อย่างปลอดภัย
    request.verifiedUser = tokenValidation;

    // Routing ไปยังฟังก์ชันต่างๆ
    let responseData;
    switch (action) {
      case "logout":            responseData = handleLogout(request); break;
      case "getDashboardStats": responseData = handleGetDashboardStats(request); break;
      case "searchStudent":     responseData = handleSearchStudent(request); break;
      case "addCase":           responseData = handleAddCase(request); break;
      case "updateCase":
        // ตรวจสอบสิทธิ์ก่อนแก้ไข: อนุญาตเฉพาะระดับ 3 (จนท.ระเบียบวินัย) หรือ 4 (ผู้ดูแลระบบ)
        // ความปลอดภัยขั้นสูง: ห้ามเชื่อข้อมูลสิทธิ์จากหน้าเว็บ (Client) เด็ดขาด ต้องใช้ค่าที่ได้จาก Token ในฐานข้อมูลเท่านั้น
        if ((request.verifiedUser.roleLevel || 1) < 3) {
          return output.setContent(JSON.stringify({ status: "error", message: "ไม่มีสิทธิ์: คุณไม่ได้รับอนุญาตให้แก้ไขข้อมูลเคส" }));
        }
        responseData = handleUpdateCase(request); break;
      case "deleteCase":
        // ตรวจสอบสิทธิ์ก่อนลบ: อนุญาตเฉพาะระดับ 3 (จนท.ระเบียบวินัย) หรือ 4 (ผู้ดูแลระบบ)
        if ((request.verifiedUser.roleLevel || 1) < 3) {
          return output.setContent(JSON.stringify({ status: "error", message: "ไม่มีสิทธิ์: คุณไม่ได้รับอนุญาตให้ลบข้อมูลเคส" }));
        }
        responseData = handleDeleteCase(request); break;
      default:                  responseData = { status: "error", message: "ไม่พบ Action ที่ระบุ" };
    }
    return output.setContent(JSON.stringify(responseData));

  } catch (error) {
    return output.setContent(JSON.stringify({ status: "error", message: error.toString() }));
  }
}

// ==========================================
// ป้องกัน Error กรณีเข้า URL ตรงๆ ด้วยเบราว์เซอร์
// ==========================================
function doGet(e) {
  return ContentService.createTextOutput("ระบบ API ทำงานปกติ (รองรับเฉพาะ POST Method)");
}

// ==========================================
// ฟังก์ชันอัปเดตข้อมูลเคส (แก้ไขข้อมูล)
// ==========================================
function handleUpdateCase(request) {
  try {
    const ss = SpreadsheetApp.openById(CASE_DB_ID);
    let sheet = ss.getSheetByName("Cases"); 
    if (!sheet) sheet = ss.getSheets()[0]; // สำรอง: ถ้าหาชีต Cases ไม่เจอ ให้ใช้ชีตแรกสุด
    
    if (!sheet) return { status: "error", message: "ไม่พบแผ่นงานใน Google Sheets" };

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return { status: "error", message: "ฐานข้อมูลว่างเปล่า" };
    const headers = data[0];
    
    // หาตำแหน่งคอลัมน์ Case ID แบบยืดหยุ่น (รองรับตัวเล็ก/ใหญ่ เว้นวรรค)
    let searchIndex = 0;
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c].toString().replace(/[\s\-\/\.]/g, '').toLowerCase();
      if (h === 'caseid' || h === 'รหัสเคส' || h === 'id') { searchIndex = c; break; }
    }

    let targetRowIndex = -1;
    let targetRowData = [];
    const reqId = String(request.caseId).trim();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][searchIndex]).trim() === reqId) {
        targetRowIndex = i + 1; // บวก 1 เพราะอาร์เรย์เริ่มที่ 0 แต่ชีตเริ่มที่ 1
        targetRowData = data[i]; // ดึงข้อมูลแถวเดิมทั้งหมดมาเตรียมไว้
        break;
      }
    }

    if (targetRowIndex === -1) {
      return { status: "error", message: `ไม่พบข้อมูลเคส (ID: ${reqId}) ที่ต้องการแก้ไขในฐานข้อมูล` };
    }

    const caseData = request.caseData || {};
    const now = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss");

    // รวบรวมคำศัพท์ที่เป็นไปได้ทั้งหมดให้ครอบคลุมที่สุด (รองรับทั้งชื่อไทย อังกฤษ และชื่อตัวแปร)
    const fieldMap = {
      "วันที่เกิดเหตุ": caseData.incidentDate, "incidentdate": caseData.incidentDate, "date": caseData.incidentDate, "วันที่": caseData.incidentDate,
      "เวลา": caseData.incidentTime, "เวลาที่เกิดเหตุ": caseData.incidentTime, "incidenttime": caseData.incidentTime, "time": caseData.incidentTime,
      "รหัสนักเรียน": caseData.studentId, "รหัสประจำตัวนักเรียน": caseData.studentId, "studentid": caseData.studentId, "รหัส": caseData.studentId,
      "ชื่อนักเรียน": caseData.studentName, "ชื่อสกุล": caseData.studentName, "studentname": caseData.studentName, "name": caseData.studentName, "ชื่อ": caseData.studentName,
      "ระดับชั้น": caseData.classRoom, "ระดับชั้นห้อง": caseData.classRoom, "ห้อง": caseData.classRoom, "ชั้น": caseData.classRoom, "classroom": caseData.classRoom,
      "ประเภทพฤติกรรม": caseData.behaviorType, "พฤติกรรม": caseData.behaviorType, "behaviortype": caseData.behaviorType, "behavior": caseData.behaviorType,
      "ประเภทย่อย": caseData.viceType, "vicetype": caseData.viceType,
      "รายละเอียด": caseData.caseDetails, "รายละเอียดเพิ่มเติม": caseData.caseDetails, "casedetails": caseData.caseDetails, "รายละเอียดเหตุการณ์": caseData.caseDetails, "detail": caseData.caseDetails, "details": caseData.caseDetails,
      "ผู้เกี่ยวข้อง": caseData.involvedStudents, "นักเรียนที่เกี่ยวข้อง": caseData.involvedStudents, "involvedstudents": caseData.involvedStudents, "involved": caseData.involvedStudents,
      "สถานะ": caseData.status, "สถานะการดำเนินการ": caseData.status, "status": caseData.status,
      "editedby": request.verifiedUser.fullName, "แก้ไขล่าสุดโดย": request.verifiedUser.fullName, "ผู้แก้ไข": request.verifiedUser.fullName,
      "lastedited": now, "เวลาแก้ไขล่าสุด": now, "แก้ไขเมื่อ": now, "timestamp": now
    };

    // ล้างอักขระพิเศษทุกชนิดออกจากชื่อ Key เพื่อง่ายต่อการเทียบขั้นสุด
    const cleanMap = {};
    for (let key in fieldMap) {
      if (fieldMap[key] !== undefined) {
          cleanMap[key.toString().replace(/[\s\-\/\.]/g, '').toLowerCase()] = fieldMap[key];
      }
    }

    let updateCount = 0;
    // นำข้อมูลใหม่ไปเขียนทับลงใน Array เดิม
    for (let col = 0; col < headers.length; col++) {
      let h = headers[col].toString().replace(/[\s\-\/\.]/g, '').toLowerCase();
      if (cleanMap[h] !== undefined) {
        targetRowData[col] = cleanMap[h];
        updateCount++;
      }
    }

    // ดักจับ: หากไม่มีคอลัมน์ไหนตรงกันเลย จะได้แจ้ง Error ให้ทราบ (ดีกว่าเงียบไปเฉยๆ)
    if (updateCount === 0) {
        return { status: "error", message: "บันทึกไม่ได้: ไม่พบชื่อคอลัมน์ที่ตรงกับระบบเลยใน Google Sheets" };
    }

    // เขียนข้อมูลทั้งแถวกลับลงไปในชีตในครั้งเดียว (ชัวร์และเร็วกว่า 100%)
    sheet.getRange(targetRowIndex, 1, 1, targetRowData.length).setValues([targetRowData]);
    // บังคับให้สคริปต์ทำการบันทึกข้อมูลที่ค้างอยู่ทั้งหมดลงชีตทันที
    SpreadsheetApp.flush();

    return { status: "success", message: "อัปเดตข้อมูลเคสเรียบร้อยแล้ว" };
  } catch (error) {
    return { status: "error", message: "เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์: " + error.toString() };
  }
}

// ==========================================
// ฟังก์ชันลบข้อมูลเคส
// ==========================================
function handleDeleteCase(request) {
  try {
    const ss = SpreadsheetApp.openById(CASE_DB_ID);
    let sheet = ss.getSheetByName("Cases");
    if (!sheet) sheet = ss.getSheets()[0]; // สำรองกรณีหาชีต Cases ไม่เจอ
    
    if (!sheet) return { status: "error", message: "ไม่พบแผ่นงานใน Google Sheets" };

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return { status: "error", message: "ฐานข้อมูลว่างเปล่า" };
    const headers = data[0];
    
    let searchIndex = 0;
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c].toString().trim().toLowerCase();
      if (h === 'case id' || h === 'รหัสเคส' || h === 'id') { searchIndex = c; break; }
    }

    const reqId = String(request.caseId).trim();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][searchIndex]).trim() === reqId) {
        sheet.deleteRow(i + 1); // สั่งลบทั้งแถว
        return { status: "success", message: "ลบข้อมูลเคสเรียบร้อยแล้ว" };
      }
    }
    return { status: "error", message: `ไม่พบข้อมูลเคส (ID: ${reqId}) ที่ต้องการลบ` };
  } catch (error) {
    return { status: "error", message: "เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์: " + error.toString() };
  }
}