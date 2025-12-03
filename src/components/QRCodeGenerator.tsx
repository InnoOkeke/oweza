import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import QRCode from 'qrcode';

interface QRCodeGeneratorProps {
    value: string;
    size?: number;
    color?: string;
    backgroundColor?: string;
}

export const QRCodeGenerator: React.FC<QRCodeGeneratorProps> = ({
    value,
    size = 200,
    color = '#000000',
    backgroundColor = '#FFFFFF',
}) => {
    const [modules, setModules] = useState<boolean[][]>([]);
    const [moduleCount, setModuleCount] = useState<number>(0);

    useEffect(() => {
        generateQRCode();
    }, [value]);

    const generateQRCode = async () => {
        try {
            // Generate QR code using create() which doesn't require canvas
            const qrCode = QRCode.create(value, {
                errorCorrectionLevel: 'M',
            });

            // Get the modules (2D array of boolean values)
            const moduleData = qrCode.modules.data;
            const size = qrCode.modules.size;

            // Convert flat array to 2D array
            const matrix: boolean[][] = [];
            for (let row = 0; row < size; row++) {
                matrix[row] = [];
                for (let col = 0; col < size; col++) {
                    matrix[row][col] = moduleData[row * size + col] === 1;
                }
            }

            setModules(matrix);
            setModuleCount(size);
        } catch (error) {
            console.error('Error generating QR code:', error);
        }
    };

    if (moduleCount === 0) {
        return <View style={{ width: size, height: size, backgroundColor }} />;
    }

    // Calculate the size of each module (pixel)
    const moduleSize = size / moduleCount;

    return (
        <View style={{ width: size, height: size }}>
            <Svg width={size} height={size}>
                {/* Background */}
                <Rect width={size} height={size} fill={backgroundColor} />

                {/* QR Code modules */}
                {modules.map((row, rowIndex) =>
                    row.map((isDark, colIndex) =>
                        isDark ? (
                            <Rect
                                key={`${rowIndex}-${colIndex}`}
                                x={colIndex * moduleSize}
                                y={rowIndex * moduleSize}
                                width={moduleSize}
                                height={moduleSize}
                                fill={color}
                            />
                        ) : null
                    )
                )}
            </Svg>
        </View>
    );
};
