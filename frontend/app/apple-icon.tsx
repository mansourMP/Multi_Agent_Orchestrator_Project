import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

export default function AppleIcon() {
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
          fontSize: 84,
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
