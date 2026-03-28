export async function runPipelineMulti(files) {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("files", file);
  });

  try {
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

    const response = await fetch(
      `${API_URL}/api/v1/pipeline-multi`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "Backend error");
    }

    return result.data;
  } catch (error) {
    console.error("API Error:", error);
    alert("Failed to run analysis. Check backend.");
    return null;
  }
}