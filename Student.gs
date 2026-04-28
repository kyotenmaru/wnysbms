// ==========================================
// Student.gs: ระบบค้นหารายชื่อนักเรียน
// ==========================================
function handleSearchStudent(request) {
  const keyword = request.keyword.toLowerCase();
  const studentSheet = SpreadsheetApp.openById(STUDENT_DB_ID).getSheetByName("Students");
  if (!studentSheet) throw new Error("ไม่พบ Sheet ชื่อ Students");
  const data = studentSheet.getDataRange().getDisplayValues();
  const results = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue; 
    const studentId = String(data[i][0]).toLowerCase(), studentName = String(data[i][1]).toLowerCase();
    if (studentId.includes(keyword) || studentName.includes(keyword)) results.push({ id: data[i][0], name: data[i][1], class: data[i][2] });
    if (results.length >= 10) break;
  }
  return { status: "success", data: results };
}