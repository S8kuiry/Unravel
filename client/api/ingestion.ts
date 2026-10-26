// api/ingestion.ts
export async function testChunkFile(path: string, content: string) {
    const response = await fetch("http://localhost:8000/ingestion/chunks", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            // Include your auth token here if your FastAPI route requires authentication
        },
        body: JSON.stringify({
            path: path,
            content: content,
            max_lines: 50,     // Optional: override defaults if you want smaller chunks
            max_chars: 5000,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to chunk file");
    }

    return await response.json();
}