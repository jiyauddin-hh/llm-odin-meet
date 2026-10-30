"use client";

import { useRequireAuth } from "@/lib/auth";
import CourseForm from "@/components/CourseForm";
import { Spinner } from "@/components/ui";

export default function NewCoursePage() {
  const { user } = useRequireAuth({ admin: true });
  if (user?.role !== "ADMIN") return <Spinner />;
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-white">New course</h1>
      <CourseForm />
    </div>
  );
}
