//src/app/api/consent/forms/teacher/route.ts
export async function GET() {
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Teacher Consent — Weekly Wellbeing & SMS</title>
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
  <h1>Teacher Consent</h1>
  <div class="box">
    <p>I consent to provide my weekly wellbeing check-in (stress, workload, notes) for staff support planning. I may also opt-in
    to receive SMS reminders for the weekly submission.</p>
    <label><strong>Name:</strong> ____________________________</label>
    <label><strong>Email:</strong> ____________________________</label>
    <label><input type="checkbox"/> I opt-in to receive weekly SMS reminders.</label>
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
