import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";

/**
 * POST /api/courier/units/[unitId]/upload-drop-photo
 * Uploads act photo for a unit during courier drop. Uses Bearer token auth.
 * Body: FormData with 'photo' file
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ unitId: string }> },
) {
  const auth = await requireCourierAuth(req);
  if (!auth.ok) return auth.response;

  const { unitId } = await context.params;
  if (!unitId) return NextResponse.json({ error: "unitId is required" }, { status: 400 });

  try {
    const { data: unit, error: unitError } = await supabaseAdmin
      .from("units")
      .select("id, barcode, warehouse_id, photos")
      .eq("id", unitId)
      .eq("warehouse_id", auth.profile.warehouse_id)
      .single();

    if (unitError || !unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const photo = formData.get("photo") as File;

    if (!photo) {
      return NextResponse.json({ error: "Photo file is required" }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(photo.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, WEBP allowed" },
        { status: 400 },
      );
    }

    const currentPhotos = (unit.photos as any[]) || [];
    const MAX_PHOTOS = 10;
    if (currentPhotos.length >= MAX_PHOTOS) {
      return NextResponse.json(
        { error: `Максимум ${MAX_PHOTOS} фотографий на unit` },
        { status: 400 },
      );
    }

    const maxSize = 5 * 1024 * 1024;
    if (photo.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB" },
        { status: 400 },
      );
    }

    const bytes = await photo.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const timestamp = Date.now();
    const ext = photo.name.split(".").pop() || "jpg";
    const filename = `${auth.profile.warehouse_id}/${unitId}/drop_act_${timestamp}.${ext}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("unit-photos")
      .upload(filename, buffer, {
        contentType: photo.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload photo" },
        { status: 500 },
      );
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("unit-photos")
      .getPublicUrl(filename);

    const photoUrl = urlData.publicUrl;

    const newPhoto = {
      url: photoUrl,
      filename,
      uploaded_at: new Date().toISOString(),
      uploaded_by: auth.user.id,
      uploaded_by_name: auth.profile.full_name,
      source: "courier_drop_act",
    };

    const updatedPhotos = [...currentPhotos, newPhoto];

    const { error: updateError } = await supabaseAdmin
      .from("units")
      .update({
        photos: updatedPhotos,
        updated_at: new Date().toISOString(),
      })
      .eq("id", unitId)
      .eq("warehouse_id", auth.profile.warehouse_id);

    if (updateError) {
      console.error("Update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update unit" },
        { status: 500 },
      );
    }

    await supabaseAdmin.rpc("audit_log_event", {
      p_action: "unit.photo_uploaded",
      p_entity_type: "unit",
      p_entity_id: unitId,
      p_summary: `Фото акта при дропе для ${unit.barcode}`,
      p_meta: {
        filename,
        photo_url: photoUrl,
        source: "courier_drop_act",
        courier_user_id: auth.user.id,
        courier_name: auth.profile.full_name,
      },
    });

    return NextResponse.json({
      ok: true,
      photo: newPhoto,
      photos: updatedPhotos,
      filename,
      url: photoUrl,
    });
  } catch (e: any) {
    console.error("Upload drop photo error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
