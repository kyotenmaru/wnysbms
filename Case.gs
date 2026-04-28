// ==========================================
// Case.gs: บันทึกข้อมูลเคสเข้าระบบ
// ==========================================
function handleAddCase(request) {
  const caseSheet = SpreadsheetApp.openById(CASE_DB_ID).getSheetByName("Cases");
  if (!caseSheet) throw new Error("ไม่พบ Sheet ชื่อ Cases");
  const caseData = request.caseData;
  
  const today = new Date();
  const datePrefix = "C" + Utilities.formatDate(today, "GMT+7", "yyyyMMdd");
  const data = caseSheet.getDataRange().getValues();
  
  let maxCount = 0;
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0]);
    if (id.startsWith(datePrefix)) {
      const numStr = id.substring(datePrefix.length);
      const num = parseInt(numStr, 10);
      if (!isNaN(num) && num > maxCount) {
        maxCount = num;
      }
    }
  }
  
  const runningNum = String(maxCount + 1).padStart(2, '0');
  const caseId = datePrefix + runningNum;

  caseSheet.appendRow([
    caseId, caseData.incidentDate, caseData.incidentTime, caseData.studentId,
    caseData.studentName, caseData.classRoom, caseData.involvedStudents, caseData.behaviorType, caseData.viceType, caseData.caseDetails,
    request.verifiedUser.fullName, "รับเรื่องแล้ว", Utilities.formatDate(today, "GMT+7", "dd/MM/yyyy HH:mm:ss")
  ]);
  return { status: "success", message: "บันทึกข้อมูลเรียบร้อยแล้ว!" };
}