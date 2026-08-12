import { enumValues } from "./enum-values";

export const CompanyType = {
  HOTEL: "hotel",
  COWORKING: "coworking",
} as const;

export type CompanyType = (typeof CompanyType)[keyof typeof CompanyType];

export const companyTypeValues = enumValues(CompanyType);
