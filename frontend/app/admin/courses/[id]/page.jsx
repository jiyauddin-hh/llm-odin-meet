"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import CourseForm from "@/components/CourseForm";
import { ErrorBox, Spinner } from "@/components/ui";

export default function EditCoursePage({ params }) {
  const { user } = useRequireAuth({ admin: true });
  const [course, setCourse] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.role === "ADMIN") {
      api(`/admin/courses/${params.id}`).then((d) => setCourse(d.course)).catch((e) => setError(e.message));
    }
  }, [user, params.id]);

  if (error) return <div className="mx-auto max-w-3xl px-4 py-10"><ErrorBox error={error} /></div>;
  if (!course) return <Spinner />;
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">
          Edit: {course.icon} {course.title}
        </h1>
        <Link href={`/admin/courses/${course.id}/access`} className="btn-ghost">
          Manage access →
        </Link>
      </div>
      <CourseForm initial={course} />
    </div>
  );
}
