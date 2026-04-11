import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(180deg, #111111 0%, #262626 100%)',
          color: '#ffffff',
          fontSize: 240,
          fontWeight: 700,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        E
      </div>
    ),
    size,
  );
}
