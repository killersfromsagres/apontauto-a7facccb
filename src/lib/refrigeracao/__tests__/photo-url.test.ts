import { describe, expect, it } from "vitest";
import {
  extractStoragePathFromUrl,
  isSupabaseStorageUrl,
} from "@/lib/photo-url";

describe("photo-url", () => {
  it("extrai o storage_path de uma signed URL legada", () => {
    const url =
      "https://abc.supabase.co/storage/v1/object/sign/refrigeracao-fotos/u1/pasta/foto%201.jpg?token=antigo";

    expect(extractStoragePathFromUrl(url, "refrigeracao-fotos")).toBe(
      "u1/pasta/foto 1.jpg",
    );
    expect(isSupabaseStorageUrl(url, "refrigeracao-fotos")).toBe(true);
  });

  it("extrai caminho de URL public ou authenticated do Storage", () => {
    expect(
      extractStoragePathFromUrl(
        "https://abc.supabase.co/storage/v1/object/public/refrigeracao-fotos/u1/foto.jpg",
        "refrigeracao-fotos",
      ),
    ).toBe("u1/foto.jpg");

    expect(
      extractStoragePathFromUrl(
        "https://abc.supabase.co/storage/v1/object/authenticated/refrigeracao-fotos/u2/foto.jpg",
        "refrigeracao-fotos",
      ),
    ).toBe("u2/foto.jpg");
  });

  it("não interpreta URL pública externa do ImgBB como Storage", () => {
    const url = "https://i.ibb.co/abc123/foto.jpg";
    expect(extractStoragePathFromUrl(url, "refrigeracao-fotos")).toBeNull();
    expect(isSupabaseStorageUrl(url, "refrigeracao-fotos")).toBe(false);
  });
});
