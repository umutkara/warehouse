import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/units/[unitId]/upload-photo
 * Uploads photo for a unit
 * Body: FormData with 'photo' file
 */
export async function POST(
  req: Request,
  { params }: { params: { unitId: string } }
) {
  const supabase = await supabaseServer();

  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("warehouse_id, full_name")
      .eq("id", userData.user.id)
      .single();

    if (!profile?.warehouse_id) {
      return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
    }

    // Get unit to verify ownership
    const { data: unit, error: unitError } = await supabase
      .from("units")
      .select("id, barcode, warehouse_id, photos")
      .eq("id", params.unitId)
      .single();

    if (unitError || !unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    if (unit.warehouse_id !== profile.warehouse_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse form data
    const formData = await req.formData();
    const photo = formData.get("photo") as File;

    if (!photo) {
      return NextResponse.json({ error: "Photo file is required" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(photo.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, WEBP allowed" },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (photo.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB" },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const bytes = await photo.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const timestamp = Date.now();
    const extension = photo.name.split(".").pop();
    const filename = `${profile.warehouse_id}/${params.unitId}/${timestamp}.${extension}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("unit-photos")
      .upload(filename, buffer, {
        contentType: photo.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload photo" },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("unit-photos")
      .getPublicUrl(filename);

    const photoUrl = urlData.publicUrl;

    // Add photo to unit's photos array
    const currentPhotos = (unit.photos as any[]) || [];
    const newPhoto = {
      url: photoUrl,
      filename: filename,
      uploaded_at: new Date().toISOString(),
      uploaded_by: userData.user.id,
      uploaded_by_name: profile.full_name,
    };

    const updatedPhotos = [...currentPhotos, newPhoto];

    // Update unit
    const { error: updateError } = await supabaseAdmin
      .from("units")
      .update({
        photos: updatedPhotos,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.unitId);

    if (updateError) {
      console.error("Update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update unit" },
        { status: 500 }
      );
    }

    // Audit log
    await supabase.rpc("audit_log_event", {
      p_action: "unit.photo_uploaded",
      p_entity_type: "unit",
      p_entity_id: params.unitId,
      p_summary: `Загружено фото для ${unit.barcode}`,
      p_meta: { filename, photo_url: photoUrl },
    });

    return NextResponse.json({
      ok: true,
      photo: newPhoto,
      photos: updatedPhotos,
    });
  } catch (e: any) {
    console.error("Upload photo error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/units/[unitId]/upload-photo?filename=...
 * Deletes a photo from unit
 */
export async function DELETE(
  req: Request,
  { params }: { params: { unitId: string } }
) {
  const supabase = await supabaseServer();

  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("filename");

    if (!filename) {
      return NextResponse.json({ error: "Filename is required" }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("warehouse_id")
      .eq("id", userData.user.id)
      .single();

    if (!profile?.warehouse_id) {
      return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
    }

    // Get unit
    const { data: unit, error: unitError } = await supabase
      .from("units")
      .select("id, barcode, warehouse_id, photos")
      .eq("id", params.unitId)
      .single();

    if (unitError || !unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    if (unit.warehouse_id !== profile.warehouse_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete from storage
    const { error: deleteError } = await supabase.storage
      .from("unit-photos")
      .remove([filename]);

    if (deleteError) {
      console.error("Delete error:", deleteError);
    }

    // Remove from unit's photos array
    const currentPhotos = (unit.photos as any[]) || [];
    const updatedPhotos = currentPhotos.filter((p: any) => p.filename !== filename);

    // Update unit
    const { error: updateError } = await supabaseAdmin
      .from("units")
      .update({
        photos: updatedPhotos,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.unitId);

    if (updateError) {
      console.error("Update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update unit" },
        { status: 500 }
      );
    }

    // Audit log
    await supabase.rpc("audit_log_event", {
      p_action: "unit.photo_deleted",
      p_entity_type: "unit",
      p_entity_id: params.unitId,
      p_summary: `Удалено фото для ${unit.barcode}`,
      p_meta: { filename },
    });

    return NextResponse.json({
      ok: true,
      photos: updatedPhotos,
    });
  } catch (e: any) {
    console.error("Delete photo error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
