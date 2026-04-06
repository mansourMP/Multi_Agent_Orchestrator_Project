use anyhow::{bail, Context, Result};
use image::{DynamicImage, ImageFormat, RgbaImage};
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::Cursor;
use xcap::Monitor;

#[derive(Debug, Deserialize)]
struct ScreenshotArguments {
    monitor: String,
    region: Option<CaptureRegion>,
}

#[derive(Debug, Deserialize)]
struct CaptureRegion {
    x: i32,
    y: i32,
    w: u32,
    h: u32,
}

pub fn capture(arguments: &Value) -> Result<Value> {
    let args: ScreenshotArguments = serde_json::from_value(arguments.clone())
        .context("invalid screenshot.capture arguments")?;
    let monitors = Monitor::all().context("failed to enumerate monitors")?;
    if monitors.is_empty() {
        bail!("no monitors available");
    }

    let selected: Vec<Monitor> = match args.monitor.as_str() {
        "all" => monitors,
        "primary" => {
            let primary = monitors
                .into_iter()
                .find(|monitor| monitor.is_primary().unwrap_or(false))
                .ok_or_else(|| anyhow::anyhow!("primary monitor not found"))?;
            vec![primary]
        }
        _ => bail!("monitor must be `primary` or `all`"),
    };

    let mut images = Vec::new();
    for monitor in selected {
        let image = monitor
            .capture_image()
            .context("failed to capture monitor image")?;
        let rgba = image_to_rgba(image)?;
        let cropped = if let Some(region) = &args.region {
            crop_region(&rgba, region)?
        } else {
            rgba
        };
        let mut png = Vec::new();
        DynamicImage::ImageRgba8(cropped.clone())
            .write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
            .context("failed to encode PNG")?;

        images.push(json!({
            "monitor_name": monitor.name().context("failed to read monitor name")?,
            "data_base64": crate::encode_png_base64(&png),
            "width": cropped.width(),
            "height": cropped.height(),
        }));
    }

    Ok(json!({ "images": images }))
}

fn image_to_rgba(image: xcap::image::RgbaImage) -> Result<RgbaImage> {
    let width = image.width();
    let height = image.height();
    RgbaImage::from_raw(width, height, image.into_raw())
        .ok_or_else(|| anyhow::anyhow!("failed to build RGBA image"))
}

fn crop_region(image: &RgbaImage, region: &CaptureRegion) -> Result<RgbaImage> {
    if region.x < 0 || region.y < 0 {
        bail!("region coordinates must be non-negative");
    }
    let x = region.x as u32;
    let y = region.y as u32;
    let max_x = x.saturating_add(region.w);
    let max_y = y.saturating_add(region.h);
    if max_x > image.width() || max_y > image.height() {
        bail!("region exceeds captured image bounds");
    }
    Ok(image::imageops::crop_imm(image, x, y, region.w, region.h).to_image())
}
