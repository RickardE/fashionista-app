-- Swimwear is its own product type (excluded from the Products and Outfits feeds).
UPDATE "products" SET "product_type" = 'swimwear' WHERE "category" = 'swimwear';
