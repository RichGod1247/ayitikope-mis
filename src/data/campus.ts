export type CampusPoint = {
  id: string;
  name: string;
  type: "Admin" | "Classroom" | "Library" | "ICT" | "Sports" | "Health" | "Gate" | "Utility" | "Washroom" | "Other";
  x: number;  // 0..100 (percent across the image)
  y: number;  // 0..100 (percent down the image)
  shortDesc?: string;
  photo?: string;     // e.g. "/campus/photos/ict-lab.jpg"
  hours?: string;     // e.g. "Mon–Fri 8:00–16:00"
};

export const CAMPUS_POINTS: CampusPoint[] = [
  // EXAMPLE — replace with real points
  { id: "main-gate", name: "Main Gate", type: "Gate", x: 8,  y: 72, shortDesc: "Visitor entry & security post" },
  { id: "admin",     name: "Administration", type: "Admin", x: 24, y: 38, shortDesc: "Headteacher’s office & records" },
  { id: "jhs-a",     name: "JHS Block A", type: "Classroom", x: 58, y: 40, shortDesc: "JHS 1–3 classrooms" },
  { id: "ict",       name: "ICT Lab", type: "ICT", x: 67, y: 55, shortDesc: "Computers & robotics club", photo: "/campus/photos/ict.jpg" },
  { id: "field",     name: "Sports Field", type: "Sports", x: 82, y: 30, shortDesc: "PE & events ground" },
];
