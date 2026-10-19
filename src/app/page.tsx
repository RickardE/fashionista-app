import { mosaicImages, ProductMosaic } from "@/components/ProductMosaic";
import { Splash } from "./splash";

export default async function SplashPage() {
  const images = await mosaicImages();
  return <Splash mosaic={images.length > 0 ? <ProductMosaic images={images} /> : null} />;
}
