interface Technology {
    name: string;
    description: string | null;
    slug: string;
    categories: Category[];
    confidence: number;
    version: string;
    icon: string;
    website: string | null;
    pricing: any[];
    cpe: string | null;
    rootPath: boolean;
    lastUrl: string;
}

interface Category {
    id: number;
    slug: string;
    groups: number[];
    name: string;
    priority: number;
}

type CategoryMap = { [categoryName: string]: Set<string> };

type CategoryArray = { [categoryName: string]: string[] };

export default async function categorize(technologies: Technology[]): Promise<CategoryArray> {


    const categorizedTechnologies = technologies.filter(({ confidence }) => confidence >= 50)
        .reduce((categorise: CategoryMap, technology) => {
            technology.categories.forEach((category) => {
                if (!categorise[category.name]) {
                    categorise[category.name] = new Set()
                }

                categorise[category.name].add(technology.name)
                // categorise[category.name].add(technology.slug)
                
            })
            return categorise
        }, {})

    // Convert Sets to Arrays
    const categorizedTechnologiesArray = Object.keys(categorizedTechnologies).reduce((acc:CategoryArray, categoryName) => {
        acc[categoryName] = Array.from(categorizedTechnologies[categoryName]);
        return acc;
    }, {});

    return categorizedTechnologiesArray;

    // return categoirzedTechnologies;
}
