import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Page not found</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-kumo-subtle">
          This URL doesn&apos;t match anything. Head back to an editor or the
          admin queue.
        </p>
        <div className="flex gap-2">
          <Link href="/editor/crop" className={buttonVariants()}>
            Open crop editor
          </Link>
          <Link
            href="/admin"
            className={buttonVariants({ variant: "secondary" })}
          >
            Admin queue
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
