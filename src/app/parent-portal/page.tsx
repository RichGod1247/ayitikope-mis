import SignInForm from "@/components/SignInForm";

export const metadata = { title: "Parents Portal • Ayitikope M/A Basic School" };

export default function ParentPortalPage() {
  return (
    <main className="container mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold">Parents Portal</h1>
      <p className="mt-2 max-w-2xl text-gray-700">
        View attendance alerts, fees, results summaries, and notifications.
      </p>

      <div className="mt-6">
        <SignInForm role="parent" />
      </div>
    </main>
  );
}
