export type StoreProduct = {
  id: string;
  name: string;
  category: string;
  price: number;
  oldPrice?: number;
  rating: string;
  badge?: string;
  image: string;
  background: string;
  description?: string;
  shopId?: string;
  shopName?: string;
  shopSlug?: string;
  stock?: number;
};
