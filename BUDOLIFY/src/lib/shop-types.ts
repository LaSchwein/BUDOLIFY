export type Shop = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string;
  contact_email: string;
  phone: string;
  logo_path: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type ShopDraft = Pick<
  Shop,
  'name' | 'slug' | 'description' | 'contact_email' | 'phone' | 'is_published'
>;

export type ShopProduct = {
  id: string;
  shop_id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  inventory: number;
  image_path: string | null;
  is_published: boolean;
  created_at: string;
  shop?: Pick<Shop, 'name' | 'slug'>;
};

export type ShopProductDraft = {
  name: string;
  description: string;
  category: string;
  price: number;
  inventory: number;
  is_published: boolean;
};
