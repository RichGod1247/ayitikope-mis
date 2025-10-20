import SignInForm from "@/components/SignInForm";

export const metadata = { title: "Teachers Portal • Ayitikope M/A Basic School" };

export default function TeacherPortalPage() {
  return (
    <main className="container mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold">Teachers Portal</h1>
      <p className="mt-2 max-w-2xl text-gray-700">
        Access class attendance, learner analytics, and teaching resources.
      </p>

      <div className="mt-6">
        <SignInForm role="teacher" />
      </div>
    </main>
  );
}
