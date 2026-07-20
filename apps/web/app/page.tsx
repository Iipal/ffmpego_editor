export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-4xl font-bold">FFmpeg Editor</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Video processing powered by Bun + Hono + Next.js
      </p>
    </div>
  );
}
