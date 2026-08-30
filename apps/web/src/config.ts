import { parseBrowserConfig } from '@oca/config/browser';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const productDataSource = import.meta.env.VITE_PRODUCT_DATA_SOURCE;
const developmentCandidateId = import.meta.env.VITE_DEVELOPMENT_CANDIDATE_ID;

export const browserConfig = parseBrowserConfig({
  ...(apiBaseUrl ? { VITE_API_BASE_URL: apiBaseUrl } : {}),
  ...(productDataSource ? { VITE_PRODUCT_DATA_SOURCE: productDataSource } : {}),
  ...(developmentCandidateId
    ? { VITE_DEVELOPMENT_CANDIDATE_ID: developmentCandidateId }
    : {}),
});
