//src/app/api/consent/student/route.ts
export async function GET() {
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Parent/Guardian Consent — Student Daily Health & SMS</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;line-height:1.5;margin:40px;}
  h1{font-size:20px;margin-bottom:6px}
  h2{font-size:16px;margin-top:24px}
  .box{border:1px solid #ccc;padding:16px;border-radius:8px;margin:16px 0}
  label{display:block;margin:8px 0}
  .sig{margin-top:40px}
</style>
</head>
<body>
  <h1>Parent/Guardian Consent</h1>
  <div class="box">
    <p>I consent to the collection of my ward’s daily temperature & symptoms during attendance. I understand this data is used
    to keep students and staff healthy, and that SMS alerts may be sent to my phone for urgent health notifications.</p>
    <label><strong>Child’s Name:</strong> ____________________________</label>
    <label><strong>Class:</strong> ____________________________</label>
    <label><strong>Guardian Name:</strong> ____________________________</label>
    <label><strong>Guardian Phone:</strong> ____________________________</label>
    <label><input type="checkbox"/> I opt-in to receive health-related SMS for my ward.</label>
    <div class="sig">
      <label><strong>Signature:</strong> ____________________________  <strong>Date:</strong> ____ / ____ / ______</label>
    </div>
  </div>
  <p>Data is handled under Ghana’s Data Protection Act (2012). For details, contact the Head Teacher’s office.</p>
  <script>window.print()</script>
</body>
</html>`
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}
